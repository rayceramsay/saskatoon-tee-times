## Why

The scraper issues every request at once. Two nested unbounded `Promise.all` layers (orchestrator over units, scraper over listings × group sizes) mean a single course fans out to ~84 simultaneous browser pages against one origin — which froze the laptop and produced 30s `page.goto` timeouts. As more courses come online spread across Chronogolf TLD mirrors, this only gets worse. Nothing today bounds concurrency, respects per-origin politeness, or reacts to a server telling us to back off.

## What Changes

- Add a **request limiter** in the transport layer that bounds concurrency along two independent axes and reacts to backoff signals:
  - **Per-host concurrency cap** (host politeness) — keyed by hostname; two courses on the same host share a budget, different hosts get independent budgets.
  - **Global browser-page ceiling** (machine compute) — a single ceiling across all hosts, specific to the browser transport, that keeps the machine alive regardless of how many hosts/mirrors are in play.
  - **Retry-After / 429 / 503 handling** — retry the failing request honoring a short `Retry-After`, and circuit-pause the whole offending host for the backoff window while leaving other hosts flowing; give up fast when the wait exceeds a threshold (the next scheduled run recovers).
- Surface a **structured transport error** from `PlaywrightJsonFetcher` carrying `{ status, retryAfterSeconds }` instead of throwing an opaque string, so the retry policy has something to read.
- Add a **`HostLimitedJsonFetcher` decorator** implementing `JsonFetcher` that derives the host from the URL and delegates through the limiter — keeping limiting transport-agnostic and out of the Playwright adapter.
- Add **explicit configuration**: per-host default + optional overrides, an env-driven browser-page ceiling, and retry thresholds — failing loud if unset.
- Wire the decorator into the local scraper composition root.

## Capabilities

### New Capabilities
- `scraper-request-limiting`: bounds outbound scraper requests by a per-host concurrency cap and a global browser-page ceiling, honors short `Retry-After`/429/503 backoff by retrying the request and circuit-pausing only the offending host, and exposes this behind a small transport-layer port with explicit configuration.

### Modified Capabilities
<!-- None. The transport seam (JsonFetcher / PlaywrightJsonFetcher) is currently unspec'd infrastructure; no existing spec requirements change. -->

## Impact

- **New code** in `packages/scraper-core/src/transport/`: the request-limiter port + a `bottleneck`-backed adapter, and the `HostLimitedJsonFetcher` decorator.
- **Modified** `packages/scraper-core/src/transport/playwright-json-fetcher.adapter.ts`: throw a typed error carrying HTTP status + `Retry-After` from the in-page fetch.
- **New dependency**: [`bottleneck`](https://www.npmjs.com/package/bottleneck), hidden behind the limiter port (does not leak past that one file).
- **Config**: new limiter settings (per-host default/overrides, `SCRAPER_MAX_BROWSER_PAGES`, retry thresholds) added to the scraper configuration surface.
- **Composition root** `apps/scraper-local/src/main.ts`: wrap `PlaywrightJsonFetcher` in `HostLimitedJsonFetcher`.
- **Package exports**: `packages/scraper-core/package.json` gains an export for the new decorator/limiter wiring.
- No behavior change to scraping semantics, schema, orchestration, or persistence.
