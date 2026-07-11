## Why

Saskatoon's four municipal courses (Holiday Park championship + executive-9, Silverwood, Wildwood) book through WebTrac, a platform that serves plain HTML rather than JSON and whose green fees are a static, city-published rate card rather than a dynamic per-slot price. Adding it exercises two seams the architecture deliberately left open — a non-browser text transport and the stubbed static-pricing path — and roughly doubles the courses on the dashboard. It also forces a modeling decision WebTrac makes unavoidable: a tee time can be *available* without being *online-bookable*, which on the current day is true of **every** slot at **every** municipal course (WebTrac only opens online booking 7 days ahead, excluding the current day).

## What Changes

- Add a **WebTrac platform scraper** (`platforms/webtrac/`) that fetches the search-results HTML for each course/hole-count over plain HTTP and cheerio-parses it into `ScrapedTeeTime` records. It emits `dynamicPrice: null` — all pricing is owned by the pricing engine.
- Add a **plain-HTTP text transport**: a `TextFetcher` port, an `HttpTextFetcher` adapter (plain `fetch`, throwing the existing `TransportError` on non-OK responses), and a `HostLimitedTextFetcher` decorator, so the limiter stack now serves non-browser transports. WebTrac runs under its **own** limiter instance.
- **Generalize the limiter's global ceiling**: rename `browserPageCeiling` → `globalMaxConcurrent` (config + adapter + comments), since a plain-`fetch` transport has no browser pages and the field is really a transport-neutral concurrency cap.
- **Implement the deferred static-pricing stub**: `resolveStatic` becomes a real first-match evaluator over the existing `PricingRule` shape (holes required; optional `daysOfWeek`/`after`/`before`/`dates`; after-tax `price`). WebTrac courses are static-only (no tax rule).
- **Add an explicit `onlineBookable` signal** to the canonical tee-time schema so an available-but-phone-only slot is kept and shown honestly (no fake booking button) rather than dropped or given a misleading portal link. **BREAKING** for the persisted/served tee-time shape (new required field).
- Wire the four WebTrac courses, their static pricing configs, and the text-fetch stack into the local scraper composition root.

## Capabilities

### New Capabilities
<!-- None — this change extends existing capabilities rather than introducing new ones. -->

### Modified Capabilities

- `tee-time-scraping`: adds the WebTrac platform (HTML fetch + cheerio parse, static-priced), adds the `onlineBookable` field to the canonical scraped/tee-time schema, and defines how phone-only slots are retained.
- `tee-time-pricing`: replaces the deferred static-resolution stub with real first-match rule evaluation, and passes `onlineBookable` through `enrich` unchanged.
- `scraper-request-limiting`: generalizes the global browser-page ceiling into a transport-neutral concurrency ceiling and extends the fetcher/decorator surface to a plain-HTTP text transport.

## Impact

- **Code (`@stt/scraper-core`)**: new `transport/text-fetcher.port.ts`, `transport/http-text-fetcher.adapter.ts`, `transport/host-limited-text-fetcher.adapter.ts`; new `platforms/webtrac/**`; edits to `domain/pricing-engine.ts` (`resolveStatic`), `domain/tee-time.schema.ts` (`onlineBookable`), `transport/request-limiter-config.schema.ts` + `transport/bottleneck-request-limiter.adapter.ts` (rename); new `package.json` `exports` entries.
- **Composition root (`apps/scraper-local`)**: additive wiring of the text stack, the WebTrac scraper, and its pricing configs; env/config rename (`SCRAPER_MAX_BROWSER_PAGES` → transport-neutral name).
- **Downstream shape**: `TeeTime` gains `onlineBookable`; the API and web app must render the phone-only state (no booking button). Persisted records gain the field.
- **External dependency**: adds a live dependency on `leisure.saskatoon.ca` WebTrac HTML; parser correctness is pinned to committed HTML fixtures.
- **No new npm dependencies** — `cheerio` is already present.
