## 1. Scaffold scraper-core

- [x] 1.1 Add `tsconfig.json` to `packages/scraper-core` extending `@stt/typescript-config` (match the base config used by sibling packages)
- [x] 1.2 Add Vitest as a dev dependency and a `vitest.config.ts` (or equivalent) plus `test`/`check-types`/`lint` scripts in `package.json`
- [x] 1.3 Create the `src/` layout organized by feature (schema, platform scrapers)
- [x] 1.4 Verify the empty package builds and tests run: `pnpm check-types`, `pnpm lint`, `pnpm test` (no tests yet is fine)

## 2. Canonical scraped-tee-time schema

- [x] 2.1 Define `GroupSize` as the closed union `1 | 2 | 3 | 4` (Zod), plus `CourseId` and `PlatformId` types
- [x] 2.2 Define `BaseTeeTime` Zod schema: `startInstant`, `courseId`, `courseName`, `holes`, `routing`, `groupSizes`, `bookingUrls` (per-group-size), `scrapedAt`
- [x] 2.3 Define `ScrapedTeeTime` extending `BaseTeeTime` with raw `dynamicPrice: number | null`; export inferred TS types
- [x] 2.4 Unit-test the schema: a valid record parses; an out-of-range group size fails validation

## 3. BookingPlatformScraper contract

- [x] 3.1 Define `CourseBookingConfig` base shape — universal course facts: `courseId`, `courseName`, `timeZone` (IANA id used to stamp `startInstant`'s local offset), `bookingPortalUrl` (rung-3 fallback)
- [x] 3.2 Define the `BookingPlatformScraper` interface: `platform`, `courses`, `scrape(courseId, date): Promise<ScrapedTeeTime[]>`

## 4. Chronogolf V1 config & Greenbryre

- [x] 4.1 Define `ChronogolfV1Listing` (`chronogolfCourseId`, `nbHoles`, `routing`) and `ChronogolfV1CourseConfig` (extends `CourseBookingConfig` with platform mechanics only: `tld`, `clubId`, `affiliationTypeId`, `listings`)
- [x] 4.2 Author the Greenbryre config: base facts (`courseName`, `timeZone: "America/Regina"`, `bookingPortalUrl`) + platform mechanics `tld: "ca"`, `clubId: 1743`, `affiliationTypeId: 7689`, listings `[{2020, 12, []}, {2020, 6, []}, {26895, 6, ["North"]}]`
- [x] 4.3 Implement the request-URL builder: `https://www.chronogolf.{tld}/marketplace/clubs/{clubId}/teetimes?date=&course_id=&affiliation_type_ids[]=×N&nb_holes=` (repeat the affiliation param once per player)

## 5. Chronogolf V1 parse & merge (pure)

- [x] 5.1 Define the raw response Zod schema `RawChronogolfV1TeeTime` (`id`, `start_time`, `date`, `hole`, `restrictions[]`, `out_of_capacity`, optional `green_fees[]`) and `parseResponse(json) → RawChronogolfV1TeeTime[]`
- [x] 5.2 Implement `mergeListing(listing, responsesByGroupSize, config, date) → ScrapedTeeTime[]`: bookable-at-G = `out_of_capacity` false AND `restrictions` empty; `groupSizes` = sizes bookable (merge by `id`); drop no-size slots; `holes` = `nbHoles`; `routing` = listing routing; `startInstant` = `date`+`start_time`+course offset; `dynamicPrice` = `green_fees[0].green_fee` from a bookable query
- [x] 5.3 Implement rung-3 booking URL: map every valid group size to `bookingPortalUrl` via a `bestBookingUrl(...candidates)` first-non-null helper

## 6. Chronogolf V1 scraper (I/O shell)

- [x] 6.1 Implement `ChronogolfV1Scraper implements BookingPlatformScraper`: private typed configs resolved by `courseId`; `scrape` builds the fan-out matrix (listings × group sizes 1–4), `fetch`es each, then applies `parseResponse` + `mergeListing` per listing and concatenates

## 7. Fixtures, tests & verification

- [x] 7.1 Capture real Greenbryre responses for one listing across all four group sizes (and both hole variants) on a date; commit as fixtures
- [ ] 7.2 Fixture test for `parseResponse`: the raw schema parses committed fixtures; a shape mismatch fails validation
- [ ] 7.3 Fixture test for `mergeListing`: correct non-contiguous `groupSizes` (e.g. `[2,3,4]` for a single-restricted empty tee), fully-booked slots dropped, `startInstant` offset, `holes`/`routing` from listing, `dynamicPrice` present-and-null cases, portal `bookingUrls`
- [ ] 7.4 Manually run `scrape("greenbryre", <date>)` against the live `.ca` mirror to confirm `fetch` returns the JSON (empirical confirmation of the fetch assumption); log/print the merged result
- [ ] 7.5 Run `pnpm format`, `pnpm check-types`, `pnpm lint`, `pnpm test` across the workspace and fix any errors
