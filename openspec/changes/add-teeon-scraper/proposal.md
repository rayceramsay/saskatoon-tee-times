## Why

The Legends Golf Club (Warman) books through TeeOn, one of the last major booking platforms not yet on the dashboard. Adding it exercises a transport seam the architecture has not yet needed: TeeOn's guest availability JSON is session-gated — its API key is injected by the portal SPA's JavaScript, so a direct fetch (even a browser navigation straight to the JSON URL) returns `401`. The data is only obtainable by loading the portal page and capturing the resulting XHR response, a navigate-and-capture pattern no current fetcher supports.

## What Changes

- Add a **TeeOn platform scraper** (`platforms/teeon/`) that captures the guest `tee-time` JSON for a course and date and normalizes it into `ScrapedTeeTime` records. Each open start yields a 9-hole record and, when a back-nine `turn_tee_time` exists, an 18-hole record. It emits `dynamicPrice: null`.
- Add a **captured-JSON transport**: a `CapturedJsonFetcher` port (`capture(pageUrl, responseUrlPrefix)`), a `PlaywrightCapturedJsonFetcher` adapter (navigate the portal page, wait for the response whose URL matches, return its parsed body; throw the shared `TransportError` on a non-OK captured response), and a `HostLimitedCapturedJsonFetcher` decorator, so the limiter stack now serves navigate-and-capture transports. TeeOn **shares the browser transport's limiter instance** so the global Playwright page ceiling is enforced across all browser-driven scrapers; its per-host cap stays independent automatically (bottleneck keys per-host budgets by hostname).
- Add the single TeeOn course, The Legends, as a config entry (`facilityId`, `portalUrl`), with the adapter written so further TeeOn courses are config-only additions — mirroring the chronogolf-v1 and webtrac structure.
- Ship TeeOn **price-free for now**: its `CoursePricingConfig` is empty (`{ rules: [] }`), so slots surface with `pricePerPlayer: null`. TeeOn guest pricing lives in a separate `tee-sheet/check-in` variant sheet whose per-slot resolution is unsolved; it is deferred to a dedicated follow-up change.
- Wire the captured-JSON stack, the TeeOn scraper, and its (empty) pricing config into the local scraper composition root.

## Capabilities

### New Capabilities
<!-- None — this change extends existing capabilities rather than introducing new ones. -->

### Modified Capabilities

- `tee-time-scraping`: adds the TeeOn platform (session-gated guest JSON captured via the portal, parsed into availability-only records that fan a start out into 9- and 18-hole rows), all courses as configuration.
- `scraper-request-limiting`: extends the fetcher/decorator surface with a navigate-and-capture JSON transport (`CapturedJsonFetcher` port + Playwright adapter + host-limited decorator) that reuses the existing limiter and `TransportError` unchanged.

## Impact

- **Code (`@stt/scraper-core`)**: new `transport/captured-json-fetcher.port.ts`, `transport/playwright-captured-json-fetcher.adapter.ts`, `transport/host-limited-captured-json-fetcher.adapter.ts`; new `platforms/teeon/**` (scraper adapter, course config type, `courses/the-legends.ts`, `__fixtures__/`); new `package.json` `exports` entries.
- **Composition root (`apps/scraper-local`)**: additive wiring of the captured-JSON stack (own limiter instance), the TeeOn scraper, and its empty pricing config entry.
- **External dependency**: adds a live dependency on `admin.teeon.com`; parser correctness is pinned to committed JSON fixtures.
- **No new npm dependencies** — `playwright-core` and `zod` are already present.
- **No schema-breaking change**: `'teeon'` is already a valid `PlatformId`; `ScrapedTeeTime`/`TeeTime` shapes are unchanged.
- **Deferred**: TeeOn dynamic pricing (the `tee-sheet/check-in` variant sheet + slot→variant resolution) is out of scope, tracked for a follow-up change.
