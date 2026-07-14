## 1. Course configuration

- [x] 1.1 Create `packages/scraper-core/src/platforms/chronogolf-v1/courses/dakota-dunes.ts` exporting `dakotaDunesConfig: ChronogolfV1CourseConfig` with `courseId: 'dakota-dunes'`, `courseName: 'Dakota Dunes'`, `timeZone: 'America/Regina'`, `bookingPortalUrl: 'https://golf.dakotadunesresort.com/book-tee-time/'`, `maxAdvanceDays: 7`, `releaseTime: '00:00'`, `tld: 'ie'`, `bookingTld: 'ca'`, `slug: 'dakota-dunes-golf-links'`, `clubId: 19739`, `affiliationTypeId: 146788`, and two listings on `chronogolfCourseId: 27975` — one `nbHoles: 18` and one `nbHoles: 9`, both `routing: []`.
- [x] 1.2 In the same file, export `dakotaDunesPricingConfig: CoursePricingConfig` as `{ tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 }, rules: [] }` (mirror `greenbryre.ts`, including its JSDoc style).
- [x] 1.3 Add the `./platforms/chronogolf-v1/courses/dakota-dunes` entry to `packages/scraper-core/package.json` `exports`, matching the existing `greenbryre` entry.

## 2. Composition wiring

- [x] 2.1 In `apps/scraper-local/src/main.ts`, import `dakotaDunesConfig` and `dakotaDunesPricingConfig` from the new course module.
- [x] 2.2 Add `dakotaDunesConfig` to the `ChronogolfV1Scraper([...])` course list (reusing the existing `limitedFetcher`).
- [x] 2.3 Add `[dakotaDunesConfig.courseId, dakotaDunesPricingConfig]` to the `PricingEngine` map.

## 3. Quality gates

- [x] 3.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors.

## 4. Verification

- [x] 4.1 Run the local scraper and confirm Dakota Dunes produces `ScrapedTeeTime` records: 18- and 9-hole slots, group sizes, empty routing, and a non-null after-tax `pricePerPlayer`.
- [x] 4.2 Confirm each booking URL is a Chronogolf reservation-review deep link on the `ca` host (the `ie` scrape mirror must not appear in any URL).
- [x] 4.3 Confirm the run fans out Dakota Dunes over 8 dates (today + 7) at all times of day, consistent with the `00:00` release.
