## Context

Two adapters in `packages/scraper-core/src/transport` carry an identical lazy-init block — `browserPromise`, `contextPromise`, `chromium.launch({ headless: true })`, and a `close()` that tears both down:

```
main()
 ├── new PlaywrightJsonFetcher()          ──lazy──▶ chromium.launch() ──▶ context ──▶ page
 │      (Chronogolf v1 + v2)
 └── new PlaywrightCapturedJsonFetcher()  ──lazy──▶ chromium.launch() ──▶ context ──▶ page
        (TeeOn)                                     ^^^^^^^^^^^^^^^^ second process
```

Both are exercised on every scrape, so both launch. Neither `JsonFetcher` nor `CapturedJsonFetcher` declares `close()`, so `apps/scraper-local/src/main.ts` holds the concrete adapter types solely to shut them down — the composition root reaching past the port to manage infrastructure the adapter secretly owns.

Constraints: hexagonal architecture with dependencies pointing inward and explicit configuration over implicit defaults (CLAUDE.md); `apps/scraper-lambda` is an empty package whose handler is imminent; `BottleneckRequestLimiter`'s `globalMaxConcurrent` already governs concurrent pages across both browser-backed transports and is unchanged by this work.

## Goals / Non-Goals

**Goals:**

- One Chromium process and one context per scrape, regardless of how many browser-backed transports run.
- Move browser lifecycle ownership out of the adapters and into the composition root, so the two runtimes can choose different lifetimes for the same object.
- Give Chromium launch arguments one home before a second composition root would copy them.
- Remove `vi.mock('playwright-core')` from both adapter tests in favor of an injected double.

**Non-Goals:**

- Abstracting Playwright behind a port. `Page` is a Playwright type and leaks through any port worth writing; the adapters *are* the Playwright layer.
- Writing the Lambda handler. This change only unblocks it.
- Touching the limiter, its concurrency ceilings, the fetcher port contracts, the host-limited decorators, or any scraper adapter.
- Pooling or reusing pages. Pages stay per-fetch.

## Decisions

### A `PlaywrightBrowserSession` class over passing a raw `BrowserContext`

Passing a `BrowserContext` straight into both constructors is the minimal thing that satisfies the goal: adapters collapse to `context.newPage()` and lose `close()` entirely. It was the leading alternative and would be the right call if `scraper-local` were the only composition root.

The session class wins because a second composition root is imminent and the raw-context approach leaves launch configuration homeless. Lambda needs `--no-sandbox` and `--disable-dev-shm-usage`; with a bare context, that arg list plus the launch/newContext/close dance gets copy-pasted into the handler and drifts. The session also gives the lifetime difference an honest place to be expressed — per-process locally, per-invocation in Lambda — rather than that knowledge living implicitly in two `main`-shaped functions.

A third alternative, a `BrowserPageProvider` port in the domain, is rejected under the Non-Goals above: it buys no isolation because `Page` leaks through it anyway.

### The session owns one context, and keeps the browser/context seam visible

The session launches one browser and creates one context, exposing page acquisition to consumers. Contexts are cheap; pages are what cost memory, and the limiter already caps concurrent pages. So a shared context saves little over a shared browser — its real value is that it is the simplest structure that satisfies the requirement.

The seam matters for one scenario: a single shared context means a single cookie jar spanning Chronogolf-behind-Cloudflare and TeeOn's session-gated SPA. Cookies are origin-scoped, so no collision is expected, and reusing Cloudflare clearance across fetches is arguably a mild benefit. Both adapters already reuse one context across all their calls today, so this is not a regression. But if TeeOn ever needs a fresh session per navigation, one global context is what bites — so the session keeps browser and context distinguishable internally, making per-platform contexts a small change rather than a redesign.

### Explicit launch, injected instance — no lazy init inside the session

The session is launched explicitly by the composition root and injected already-live, rather than lazily launching on first page acquisition. Lazy init is exactly what produced the current problem: it is invisible, it defers failure to the first fetch, and in Lambda it means a browser nobody closes leaks into a frozen container. Explicit launch fails loud at startup if Chromium is unavailable, per the project's explicit-configuration principle. `main()` is already `async`, so this costs nothing at the call site.

### Adapters keep their per-fetch page discipline

Each `fetchJson`/`capture` acquires a page and closes it in a `finally`, exactly as today. Only the *source* of the page changes. This keeps the diff to the lifecycle block and leaves the navigation, capture, and `TransportError` logic — including `parseRetryAfter`, duplicated across both files — untouched and independently verifiable.

### Tests inject a fake session

Both test files currently hand-wire `chromium.launch → browser → context → page` through `vi.mock('playwright-core')`, which couples them to the launch sequence rather than the fetch behavior. Injecting a double that yields a stub `Page` tests the same behavior against the contract the adapter actually depends on, satisfying "test behaviours, not implementation details."

## Risks / Trade-offs

- **Shared cookie jar across Chronogolf and TeeOn** → Cookies are origin-scoped and both adapters already reuse one context per adapter, so no behavior change is expected. The browser/context seam inside the session keeps per-platform contexts cheap if TeeOn's session priming ever proves order-dependent.
- **One browser is a single point of failure — a crash takes down every browser-backed scraper, where today a Chronogolf crash spares TeeOn** → Accepted. `TeeTimeOrchestrator` already isolates per-scraper failures, and two browsers is not a deliberate redundancy strategy worth paying for. Not mitigated in this change.
- **`close()` disappearing from the adapters is a breaking API change** → Contained: both adapters are internal to the monorepo with `scraper-local` the only consumer, and `close()` was never part of either port. `check-types` catches every call site.
- **The session could accrete responsibilities and become a god object** → Keep its surface to page acquisition plus teardown. Limiting stays in the decorators; navigation stays in the adapters.
- **A shared context means shared HTTP cache across hosts** → Benign at current scale; the limiter's global ceiling, not the cache, governs fan-out.

## Migration Plan

Internal refactor with no persisted state, no API surface, and no deployed Lambda consumer yet — no phased rollout or data migration. The sequence is: add the session, convert both adapters and their tests, then rewire `scraper-local`'s composition root and shutdown path in the same change so the tree never has a half-injected adapter. Rollback is a revert. Verification is `pnpm format`, `pnpm check-types`, `pnpm lint`, the adapter test suites, and one local scrape confirming a single Chromium process and clean teardown on SIGINT.

## Open Questions

- Does TeeOn's capture depend on a *fresh* session per navigation? Current behavior says no — the adapter already reuses one context across captures — but this is assumed, not verified. If it ever inverts, the session's browser/context seam is where the fix lands.
- Lambda's exact launch arguments (`--no-sandbox`, `--disable-dev-shm-usage`, `--single-process`) are deferred to the handler change. This change establishes where they go, not what they are.
