## Why

The scraper package (`packages/scraper-core`) is greenfield — only dependencies are installed, no code exists. Courses outsource booking to a handful of third-party platforms (Webtrac, Chronogolf V1, Chronogolf V2, TeeOn), so scraping is abstracted per **platform**, with each **course as configuration**. Before building all four platforms, we need a thin vertical slice that proves the core abstraction end-to-end: fetch a real course's tee times, normalize them to the canonical schema, and prove the parse layer is fixture-testable. This slice de-risks the abstraction on the simplest platform (Chronogolf returns JSON) before we invest in HTML scraping, rate limiting, orchestration, and pricing.

## What Changes

- Scaffold `packages/scraper-core` for real: `tsconfig` extending `@stt/typescript-config`, Vitest, a `src/` layout, and package exports.
- Introduce the canonical scraped-tee-time schema (Zod + inferred types): `GroupSize`, `CourseId`, `PlatformId`, `BaseTeeTime`, and `ScrapedTeeTime`. This is the left side of the schema seam — the finalized `TeeTime` (pricing) is deferred.
- Define the `BookingPlatformScraper` interface up front (`platform`, `courses`, `scrape(courseId, date)`), even though only one implementation exists yet — it is the north-star contract the orchestrator will consume.
- Implement `ChronogolfV1Scraper` as the first concrete `BookingPlatformScraper`, configured for a single course (Greenbryre): naive `fetch` of the Chronogolf JSON endpoint, plus a pure `parse` function tested against a captured fixture.
- Resolve `bookingUrls` at rung 3 only (the per-course portal fallback constant); deep-linking is deferred.
- Capture `dynamicPrice` as the raw number from the response, untouched (no tax normalization, no pricing engine).

Explicitly **out of this slice** (deferred to later changes): `HostRateLimiter`/`HttpClient`, `bookableDates`/booking-window logic (the date is passed in directly), the orchestrator, the `PricingEngine`/`TeeTime` seam, booking-URL deep-linking, and all other platforms and courses.

## Capabilities

### New Capabilities

- `tee-time-scraping`: Scraping tee-time availability from a booking platform for a given course and date, normalized to the canonical `ScrapedTeeTime` schema. This slice establishes the `BookingPlatformScraper` contract, the scraped-tee-time schema, and the first platform implementation (Chronogolf V1 → Greenbryre).

### Modified Capabilities

None — this is the first capability in the project.

## Impact

- **New code:** `packages/scraper-core/src/` (schema, `BookingPlatformScraper` interface, `ChronogolfV1Scraper`, course config, parse function, fixture + tests) and package scaffolding (`tsconfig.json`, Vitest config, exports).
- **Dependencies:** Uses already-installed `zod`; adds `vitest` as a dev dependency. `cheerio`/`playwright-core` remain unused this slice.
- **Downstream:** `apps/scraper-lambda`, `apps/scraper-local`, and `apps/api` are untouched; they consume `scraper-core` in later changes.
- **External:** Makes live HTTP requests to a Chronogolf mirror during manual/local verification, but not in CI (parse is fixture-tested; no live-site calls in CI).
