## Why

A single Greenbryre scrape (~96 requests: 8 dates × 3 listings × 4 party sizes) currently takes ~85s, versus ~3s in the prior spike. The cause is `PlaywrightJsonFetcher`: on **every** request it navigates the browser to the Cloudflare-fronted marketplace homepage (`page.goto(origin)`) and only then issues a same-origin `fetch` for the JSON. The homepage load is pure overhead paid ~96 times per run. The spike instead pointed the browser straight at the JSON endpoint (`page.goto(jsonUrl)` → `response.json()`) — one lightweight navigation per request, still a real browser, no homepage. Direct navigation has been re-confirmed to still return raw JSON today.

## What Changes

- Rework `PlaywrightJsonFetcher.fetchJson` to navigate the page **directly to the JSON URL** and read the parsed body from the navigation response, dropping the `origin` load and the in-page `evaluate(fetch(...))` round-trip.
- Read HTTP `status` and `Retry-After` for the typed `TransportError` from the Playwright **navigation response** (`response.status()`, `response.headers()['retry-after']`) instead of from an in-page `fetch` response — no page boundary to cross.
- No change to the `JsonFetcher` port surface, the `HostLimitedJsonFetcher` decorator, the rate limiter, the retry/backoff thresholds, or the Chronogolf V1 scraper/parser — the fetcher stays substitutable behind the same port.

The endpoint returns a 60s `Retry-After` when overloaded, above the `SCRAPER_MAX_RETRY_AFTER_SECONDS` default of 30. That threshold is left as-is on purpose: a host asking for a 60s backoff is unhappy enough that giving up and letting the next scheduled run recover the `(course, date)` unit is preferable to holding a browser page open for a minute.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `scraper-request-limiting`: The "Structured transport error carrying backoff signal" requirement no longer mandates reading status/`Retry-After` from an *in-page* response before it crosses the page boundary; the browser JSON fetcher reads them from the navigation response directly. Requirement intent (a typed error exposing `status` and optional `retryAfterSeconds`) is preserved.

## Impact

- **Code**: `packages/scraper-core/src/transport/playwright-json-fetcher.adapter.ts` (rework fetch path) and its test.
- **Behavior**: ~85s → target ~single-digit seconds for a Greenbryre run; fewer resources per request (no SPA render), reducing the chance of tripping Cloudflare in the first place.
- **Unchanged**: rate-limiter, orchestrator, scraper/parser, persistence, and the `JsonFetcher` port contract. TeeOn's separate browser auth step is out of scope.
