## Context

Scrapers funnel every request through `JsonFetcher.fetchJson(url)`. The Playwright adapter opens a fresh page per call (`context.newPage()` → `goto(origin)` → in-page `fetch(url)`) over a shared, lazily-launched browser + context. Above it, two unbounded `Promise.all` layers — the orchestrator over (scraper, course, date) units and each Chronogolf scraper over listings × group sizes — mean all requests fire simultaneously. For one course today (`Greenbryre → www.chronogolf.ca`, 3 listings × 4 group sizes × 7 dates = 84 requests) that is 84 concurrent Chromium pages against one origin, which froze the laptop and produced 30s `page.goto` timeouts.

The observed pain was not a many-hosts problem — it was 84 simultaneous browser pages against one origin (the origin rate-limiting a burst, local compute exhaustion, or both). Either way the fix is the same: stop bursting.

The core reframe is that "rate limiting" is three distinct concerns that live in different places and are keyed differently — conflating them is the source of most "where does the limit go?" confusion:

- **Axis A — host politeness** ("how hard can I hit this origin before it 429s?"): a constraint on the *remote server*, keyed per hostname (`chronogolf.ca` ≠ `chronogolf.com`). Two courses on the same host share a budget. → a per-host concurrency cap.
- **Axis B — compute ceiling** ("how many browser pages can my machine survive?"): a constraint on *my machine*, global across hosts. Every `newPage()` costs the same regardless of target host; only the Playwright transport pays it (a future plain-`fetch` transport is cheap). This is the thing that froze the laptop.
- **Axis C — retry/backoff** ("the server told me to back off"): a constraint from a *response* (429/503 + `Retry-After`). Honor `Retry-After` when present and short; otherwise give up (the next 15-min run retries).

Today A and B coincide (all pages are Chronogolf, one host, one browser) so a single per-host cap would incidentally bound both. They **diverge** the moment more hosts appear or the TLD-mirror lever is used — Chronogolf serves identical data under many origins (`.ca`, `.com`, `.ie`, …), each rate-limited independently, and courses are being spread across mirrors immediately. On the browser transport, more mirrors = more independent buckets = *more concurrent pages* = exactly what froze the laptop (`4 mirrors × 3-per-host = 12 pages`). So both A and B must be fixed now, not deferred. The current `PlaywrightJsonFetcher` also throws a plain string from inside `page.evaluate`, incinerating the status code and `Retry-After` header; Axis C needs that structure restored.

## Goals / Non-Goals

**Goals:**
- Stop bursting: bound per-host concurrency (Axis A) and total browser pages (Axis B) simultaneously.
- Honor short `Retry-After`/429/503 by retrying the failing job and circuit-pausing only the offending host (Axis C), leaving other hosts flowing.
- Keep limiting transport-agnostic (a decorator over `fetchJson`, not baked into Playwright) and keep `bottleneck` hidden behind a small port.
- Explicit configuration keyed per host with one global default; fail loud on the unset page ceiling.
- Do the plumbing once (Bottleneck delivers A+B+C together) so it need not be revisited.

**Non-Goals:**
- Per-course or per-platform limiter tuning — the key is always the hostname.
- Modeling "unlimited" for lenient hosts (e.g. Webtrac) — a sane global default protects our own compute and is simpler.
- Per-host `minTime` (min interval between requests) — left as an unused Bottleneck seam, added only if a real 429 persists despite the concurrency cap.
- Fully isolating the root cause of the 30s timeouts (server-side limiting vs. compute exhaustion) — the concurrency cap addresses both.
- The future Webtrac plain-`fetch` transport — noted for shape, not built here.

## Decisions

### The seam is a decorator over `fetchJson(url)`

Wrap the existing port with `HostLimitedJsonFetcher implements JsonFetcher`: derive `host = new URL(url).host`, then `limiter.schedule(host, () => inner.fetchJson(url))`. Limiting does **not** go inside `PlaywrightJsonFetcher` — that would couple politeness to transport mechanics and force every future transport to re-implement it. The limiter stays a pure structure (`schedule(host, fn)`), unit-testable without a browser. **Alternative rejected:** bake limiting into the Playwright adapter — couples concerns and duplicates per transport.

### Bottleneck, composing Axis A under Axis B via `chain()`

Use [`bottleneck`](https://www.npmjs.com/package/bottleneck) — it gives A, B, and C together.
- **Axis A** = `Bottleneck.Group` keyed by hostname; each key lazily gets its own child limiter with `maxConcurrent` = the per-host cap.
- **Axis B** = a single global parent `Bottleneck` with `maxConcurrent` = the browser-page ceiling; each per-host child is `child.chain(parent)`.

```
                          ┌─────────────────────────────────────┐
                          │  GLOBAL PARENT  (Axis B)             │
                          │  maxConcurrent = browserPageCeiling  │
                          └──────────────▲──────────────────────┘
                                         │ chain()  (every child → parent)
        ┌────────────────────────────────┴────────────────────────────┐
        │                 Bottleneck.Group<host>  (Axis A)             │
        │  chronogolf.ca    chronogolf.com    chronogolf.ie   ...      │
        │  maxConcurrent=3   maxConcurrent=3   maxConcurrent=3         │
        └──────────────────────────────────────────────────────────────┘

a job runs  ⇔  its host has a free slot  AND  a global page slot is free
```

`chain()` starts a job only when capacity exists in **both** the host child and the global parent, so no global slot is held while waiting on a busy host. **Alternative rejected:** manual nesting `global.run(() => host.run(fn))` — causes head-of-line blocking (a job holds a global slot while waiting on a busy host, starving a free-host job).

Wiring is a per-child hook when the Group lazily creates a limiter — Bottleneck exposes a `created` event on the Group (`group.on('created', (child, key) => child.chain(parent))`). *The exact hook name/signature is verified against the library during implementation.*

Axis B is browser-transport-specific: the page-ceiling parent belongs to the Playwright limiter only. A future Webtrac plain-`fetch` transport gets its own per-host Group with **no** ceiling parent. This is clean because no host is ever shared across transports (Webtrac host ≠ Chronogolf host), so "one limiter per transport" is correct — no shared cross-transport limiter needed.

Consequence to internalize: on the browser transport, mirror-spreading buys **politeness, not speed** — total throughput is capped by the ceiling regardless of how many mirrors fan out (`4 mirrors × 3 = 12 desired`, ceiling 6 → only 6 run). Raise the ceiling in Lambda where there is more compute.

### Retry-After / 429 / 503 acts at two scopes

A 429/503 tells the *whole host* to back off, not just one request. So two things happen at two scopes, both wired in the Group's `created` hook where the child limiter **and** its host key are in scope:
1. **The failing job** — Bottleneck's `failed` handler returns a delay (ms) to re-queue and retry, honoring `retryAfterSeconds` (or a computed backoff when absent). Give up when: not retryable, attempts exhausted, or the wait exceeds `maxRetryAfterSeconds` (fail fast, no pause — next run recovers).
2. **The whole host** — a **circuit pause** via Bottleneck's per-child `reservoir` (a count of jobs a limiter may start before it's empty): `null` normally (disabled — only `maxConcurrent` applies), `0` to pause (in-flight jobs finish, no new job for that host starts, queue holds), back to `null` to resume. Both target the same `resumeAt`.

```
normal:   reservoir = null   (disabled — only maxConcurrent applies)
429 hit:  reservoir = 0       (host paused; queue holds; other hosts unaffected)
resumeAt: reservoir = null    (host resumes; queued jobs + the retry flow again)
```

Both handlers hang off the Group's `created` event:

```ts
group.on('created', (limiter, host) => {
  limiter.chain(parent);                                  // Axis B ceiling

  limiter.on('failed', async (error, info) => {
    if (!isRetryable(error)) return;                      // non-429/503 → orchestrator isolate()
    if (info.retryCount >= maxAttempts) return;           // exhausted → give up, next run
    const waitMs = (error.retryAfterSeconds ?? backoff(info.retryCount)) * 1000;
    if (waitMs > maxRetryAfterSeconds * 1000) return;     // too long → give up, no pause (fail fast)

    await pauseHost(host, waitMs);                        // ← the circuit pause
    return waitMs;                                        // this job retries after the wait
  });
});
```

The one piece of real state is a **pause coordinator** — because multiple in-flight jobs to the same host can 429 at once, it dedupes and *extends* (does not stack) the window:

```ts
const pauses = new Map<string, { timer: Timeout; resumeAt: number }>();
function pauseHost(host, waitMs) {
  const resumeAt = Math.max(Date.now() + waitMs, pauses.get(host)?.resumeAt ?? 0);
  clearTimeout(pauses.get(host)?.timer);
  group.key(host).updateSettings({ reservoir: 0 });        // pause now (idempotent)
  const timer = setTimeout(() => {
    group.key(host).updateSettings({ reservoir: null });   // resume via key(), not a stale ref
    pauses.delete(host);
  }, resumeAt - Date.now());
  pauses.set(host, { timer, resumeAt });
}
```

Resume through `group.key(host)` (not a captured `limiter` reference) so it targets the right instance if the Group recycled an idle limiter. **Decisions folded in:**
- **Over-threshold `Retry-After` → give up, no pause.** If the server says "5 minutes" and the threshold is 30s, fail those jobs fast this run rather than stall the whole run for a host it won't finish; they recover next run. A few extra 429s from other queued jobs is the accepted cost.
- **In-flight jobs during a pause continue** (`reservoir` only gates *starts*). They may re-429 and re-trigger `pauseHost`, which just extends the window. Fine.
- **Other hosts are untouched** — separate limiters, separate reservoirs. Exactly the isolation we want.

### Structured transport error is the real engineering

`PlaywrightJsonFetcher` must read `response.status` + `response.headers.get('retry-after')` inside the in-page `fetch` and throw a typed error carrying `{ status, retryAfterSeconds }` that survives the `page.evaluate` boundary. `isRetryable(error)` and the wait computation read that structure. Once the error carries structure, the retry policy on top is small.

### Config: keyed per host, one default + optional overrides

```
limiterConfig = {
  perHost: {
    default:    { maxConcurrent: 3 },
    overrides?: { 'www.chronogolf.ca': { maxConcurrent: … } },  // only misbehavers
  },
  browserPageCeiling: env.SCRAPER_MAX_BROWSER_PAGES,  // Axis B — MUST be config, fail loud if unset
  retry: { maxAttempts, maxRetryAfterSeconds },       // Axis C
}
```

Lenient hosts inherit the default (being nice is free); strict hosts get a single override only if the default proves too hot; everything else inherits. Follows the repo's env-config style (Zod schema keyed by `UPPERCASE_SNAKE_CASE`, inline defaults, fail loud via `prettifyError`). **Seed values** (tuned later against real behavior): per-host `maxConcurrent` = **3**, `browserPageCeiling` = **6** (laptop survival; raise in Lambda), `maxRetryAfterSeconds` = **30**.

### Library placement

The limiter lives in `packages/scraper-core/src/transport/` next to the fetchers, behind a small port (`schedule(host, fn)`) so `bottleneck` does not leak past that one adapter — consistent with the hexagonal / explicit-dependencies mandate.

## Risks / Trade-offs

- **Exact Bottleneck Group→chain wiring (the `created` event hook)** → verify hook name/signature against the library during implementation before relying on it.
- **`reservoir: null` as the resume/unlimited value** → confirm `updateSettings({ reservoir: null })` cleanly re-disables the reservoir after it was numeric. Fallback: restore to a high sentinel that won't meaningfully deplete over ~100 requests/run.
- **`updateSettings` timing inside a `failed` handler** returns a promise → make the handler `async` and await it so the pause takes effect before the next job for that host is pulled.
- **The page ceiling caps total browser throughput** → intended; spreading more mirrors won't go faster than the ceiling. Set expectations; raise the ceiling in Lambda.
- **Root cause of the 30s timeouts not fully isolated** (server-side vs. compute) → the concurrency cap addresses both, so isolating it is not blocking.
- **`minTime` left unused** → add a per-host interval only if a 429 persists despite the concurrency cap.

## Open Questions

- Final wording/signature of Bottleneck's Group `created` event (child + key ordering) — resolve during implementation.
- Whether `reservoir: null` restore behaves as expected after a numeric value, or the high-sentinel fallback is needed.
