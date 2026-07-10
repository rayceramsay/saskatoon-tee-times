## Context

`PlaywrightJsonFetcher` is the `JsonFetcher` adapter that Chronogolf V1 scraping runs through. Chronogolf sits behind Cloudflare and fingerprints clients at the TLS layer, so a real browser is required — plain Node `fetch` is rejected. The current adapter satisfies that constraint by, per request: opening a new page, navigating to the target's **origin** (`page.goto(new URL(url).origin)`), then running an in-page `evaluate(fetch(jsonUrl))` and reading `status`/`Retry-After` from that in-page response.

The origin is the Cloudflare-fronted marketplace SPA. Reaching `domcontentloaded` pulls HTML, JS bundles, and executes script — ~0.5–2s of pure overhead, paid on **every** request. A Greenbryre run fans out to ~96 requests (8 dates × 3 listings × 4 party sizes), all on one host capped at `maxConcurrent: 3`, so the run takes ~85s.

The prior spike (`../saskatoon-tee-times/backend/src/scraping/browser.ts`) took a different path: `page.goto(jsonUrl)` straight to the JSON endpoint, then `response.json()`. One lightweight navigation per request, still a real browser (full TLS fingerprint + Cloudflare clearance), no homepage. That ran ~96 requests in ~3s. Direct navigation to the JSON endpoint has been re-confirmed to still return raw JSON today; overloading it returns 429 with a **60s** `Retry-After`.

## Goals / Non-Goals

**Goals:**

- Eliminate the per-request origin homepage load by navigating directly to the JSON URL.
- Preserve the typed `TransportError` (status + optional `retryAfterSeconds`) that the rate limiter's backoff depends on, sourced from the navigation response.
- Keep the `JsonFetcher` port, the `HostLimitedJsonFetcher` decorator, the limiter, the retry/backoff thresholds, and the scraper/parser untouched.

**Non-Goals:**

- Changing the rate limiter, orchestrator, or concurrency caps. Per-host `maxConcurrent: 3` stays; the fix reduces per-request cost, not the number of requests.
- Touching Webtrac, Chronogolf V2, or TeeOn (TeeOn's browser auth step is a separate mechanism).
- Reintroducing plain Node `fetch` — the real-browser requirement stands.

## Decisions

### 1. Navigate directly to the JSON URL, read the body from the navigation response

Replace `goto(origin)` + `evaluate(fetch(...))` with `const response = await page.goto(url, { waitUntil: 'domcontentloaded' })`, then parse the body. This is the spike's proven approach and removes the SPA render from the hot path.

- **Body**: prefer `await response.json()` on the Playwright navigation response. If the runtime/Content-Type makes `.json()` unreliable for a raw-JSON document render, fall back to `JSON.parse(await response.text())` (or `page.evaluate(() => document.body.innerText)` as the spike did). The adapter still returns `unknown`; Zod validation downstream is unchanged.
- **Alternative considered — load origin once per context, then reuse one page for all same-origin fetches (Fix B):** amortizes the homepage load from 96× to 1× but keeps the SPA render and the more complex in-page fetch path. Rejected as the primary fix because direct navigation is simpler and already confirmed working; Fix B stays on the shelf only if Chronogolf later starts challenging direct navigation to the endpoint.

### 2. Source status and `Retry-After` from the navigation response, not an in-page fetch

With direct navigation there is no page boundary to cross: read `response.status()` and `response.headers()['retry-after']` on the Node side, then construct `TransportError` with the existing `parseRetryAfter` normalization. On a 429/503 the fetcher throws `TransportError`; `.json()` is only attempted for OK responses. This preserves the "Structured transport error carrying backoff signal" requirement while updating its mechanism (see the delta spec).

- A `null`/absent navigation response (unlikely for these requests) is treated as a transport failure rather than dereferenced.

### 3. Leave the honored `Retry-After` threshold at 30s

The endpoint returns a 60s `Retry-After` when overloaded, above the `SCRAPER_MAX_RETRY_AFTER_SECONDS` default of 30 — so a 429 exceeds the threshold and the limiter gives up on the unit immediately (per the existing "give up without pausing" scenario), recovered by the next 15-min run. This is left unchanged deliberately: a host asking for a 60s backoff is unhappy enough that giving up beats holding a browser page open for a minute, and the run's other units keep flowing. The real mitigation for 429s is dropping the homepage load (Decision 1), which lowers request weight enough to make them rare in the first place.

## Risks / Trade-offs

- **`response.json()` on a navigation response may behave differently across Playwright/Chromium than an in-page `fetch().json()`** → keep a `JSON.parse(text)` fallback; the adapter test asserts a real JSON body is returned intact.
- **Direct navigation could be challenged by Cloudflare where same-origin fetch was not** → re-confirmed working now; if it regresses, Fix B (load origin once, reuse page) is the documented fallback and the port contract makes swapping the internals local to this adapter.
- **A sustained overload trips the 60s `Retry-After` and drops the unit for that run** → accepted: the 30s threshold intentionally gives up rather than waiting, and per-unit isolation means only the affected `(course, date)` units are skipped until the next scheduled run. Dropping the homepage load is what keeps overloads rare.
- **Test rewrite**: the existing adapter test mocks the in-page `evaluate(fetch)` path; it must be reworked to mock `page.goto` returning a response with `status()`/`headers()`/`json()`. Behavior asserted (returns parsed JSON; throws typed error with status + retryAfterSeconds) stays the same.
