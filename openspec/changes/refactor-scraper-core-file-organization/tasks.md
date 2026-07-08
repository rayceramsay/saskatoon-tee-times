## 1. Domain layer

- [x] 1.1 Create `src/domain/`. Merge `schema/group-size.ts` + `schema/identifiers.ts`
      → `domain/primitives.schema.ts` (`GroupSize`, `CourseId`, `PlatformId`).
- [x] 1.2 Move `schema/scraped-tee-time.ts` → `domain/tee-time.schema.ts`
      (`BaseTeeTime`, `ScrapedTeeTime`); move `schema/scraped-tee-time.test.ts` →
      `domain/tee-time.schema.test.ts`.
- [x] 1.3 Move `platforms/course-booking-config.ts` → `domain/course-config.base.ts`
      and rename the type `CourseBookingConfig` → `CourseConfig`.
- [x] 1.4 Move `platforms/booking-platform-scraper.ts` →
      `domain/booking-platform-scraper.port.ts`.
- [x] 1.5 Move `platforms/best-booking-url.ts` → `domain/best-booking-url.util.ts`.
- [x] 1.6 Move `time/build-local-start-instant.ts` →
      `domain/local-start-instant.util.ts`.

## 2. Transport layer

- [x] 2.1 Create `src/transport/`. Move `platforms/json-fetcher.ts` →
      `transport/json-fetcher.port.ts`.
- [x] 2.2 Move `platforms/playwright-json-fetcher.ts` →
      `transport/playwright-json-fetcher.adapter.ts`.

## 3. Chronogolf V1 platform

- [x] 3.1 Rename `platforms/chronogolf-v1/chronogolf-v1-config.ts` →
      `platforms/chronogolf-v1/chronogolf-v1-course-config.ts` (keep
      `ChronogolfV1CourseConfig extends CourseConfig`, `ChronogolfV1Listing`).
- [x] 3.2 Fold `build-tee-times-request-url.ts`, `parse-response.ts`
      (with `RawChronogolfV1TeeTime` + `parseResponse`), and `merge-listing.ts`
      into `chronogolf-v1-scraper.adapter.ts` as module-private functions; delete
      the three standalone files.
- [x] 3.3 Rename the scraper class file
      `chronogolf-v1-scraper.ts` → `chronogolf-v1-scraper.adapter.ts`.
- [x] 3.4 Leave `courses/greenbryre.ts` and `__fixtures__/` in place (different
      change axes); update only their import specifiers as needed.

## 4. Consolidate Chronogolf tests behind `scrape()`

- [x] 4.1 Rename `chronogolf-v1-scraper.test.ts` →
      `chronogolf-v1-scraper.adapter.test.ts`; it already drives `scrape()` with a
      stub `JsonFetcher` over the committed fixtures.
- [x] 4.2 Migrate the assertions from `parse-response.test.ts` and
      `merge-listing.test.ts` into the adapter test, asserting through `scrape()`:
      non-contiguous `groupSizes`, fully-booked slots dropped, `startInstant`
      offset, `holes`/`routing` sourced from the listing, `dynamicPrice`
      present-and-null cases, portal-fallback `bookingUrls`.
- [x] 4.3 Delete `parse-response.test.ts` and `merge-listing.test.ts`.

## 5. Wire-up and cleanup

- [x] 5.1 Update all import specifiers across the package to the new paths,
      including `.js` extension specifiers.
- [x] 5.2 Remove the now-empty `src/schema/`, `src/time/` directories (and the
      framework files that left `src/platforms/`).
- [x] 5.3 Confirm no `package.json` `exports` map exists to update (out of scope —
      none exists and nothing consumes this package yet). No edit expected.

## 6. Verify (no behavioural diff)

- [x] 6.1 Run `pnpm format`, `pnpm check-types`, `pnpm lint`, `pnpm test`; fix any
      errors. All existing behaviour and coverage must hold.
