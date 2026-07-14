## 1. Fixtures

- [x] 1.1 Capture a real Chronogolf V2 `/marketplace/v2/teetimes` response for The Willows by navigating a browser to the JSON URL (all three loop UUIDs + `18` in `course_ids`, a future `start_date`, `page=1`), and commit under `packages/scraper-core/src/platforms/chronogolf-v2/__fixtures__/` — include a page exhibiting multiple loops, a same-start-time-on-two-loops pair, a spread of `min_player_size`/`max_player_size`, and `default_price.bookable_holes === 9`, plus a `README.md` documenting how it was captured (URL, course_ids, date)
- [x] 1.2 Capture the empty terminal page (a later `page=N` whose `teetimes` is `[]`) as a second fixture so the pagination stop condition is fixture-backed

## 2. Chronogolf V2 platform

- [ ] 2.1 Add `platforms/chronogolf-v2/chronogolf-v2-course-config.ts` (`ChronogolfV2CourseConfig extends CourseConfig` with `courseIds: string[]`, `slug: string`, `affiliationTypeId: number`, `tld: string`)
- [ ] 2.2 Add `platforms/chronogolf-v2/chronogolf-v2-scraper.adapter.ts` (`ChronogolfV2Scraper implements BookingPlatformScraper`, `platform = 'chronogolf-v2'`, private configs, injected `JsonFetcher`): resolve the course, then walk `page=1,2,3…` sequentially — building each URL from `start_date`, comma-joined `course_ids`, and `page` — stopping when a page's `teetimes` is empty, then parse and concatenate the pages
- [ ] 2.3 Implement response parsing (Zod) modeling only consumed fields (`teetimes[]` with `id`, `course.name`, `course.bookable_holes`, `start_time`, `date`, `min_player_size`, `max_player_size`, `default_price` nullable with `green_fee` + `bookable_holes`); validate against the committed fixture so a shape change fails loudly
- [ ] 2.4 Implement `groupSizes` as the inline contiguous range `[min_player_size .. max_player_size]`, dropping any tee time whose range is empty
- [ ] 2.5 Implement the per-hole-count fan-out: one record per `course.bookable_holes` entry, each `routing: [course.name]`, `holes` from the entry; `startInstant` via the shared local-start-instant util from `date` + `start_time` + course time zone; `onlineBookable: true`
- [ ] 2.6 Implement `dynamicPrice`: `default_price.green_fee` only when `default_price.bookable_holes` equals the record's hole count, else `null` (no tax applied)
- [ ] 2.7 Implement per-group-size `bookingUrls`: build a reservation-review deep link `…/club/<slug>/booking/?source=chronogolf&medium=profile#/teetime/review?affiliation_type_ids=<id×players>&teetime_id=<id>&nb_holes=<holes>&engine=2`, selected via `bestBookingUrl(deepLink, config.bookingPortalUrl)`
- [ ] 2.8 Add scraper/parser tests driven by the committed fixtures asserting: pagination stops at the empty page; inline contiguous group sizes; 9/18 hole fan-out with single-element routing; two distinct records at one `startInstant` for same-time-different-loop starts; `dynamicPrice` set on the 9-hole record and `null` on the 18-hole record; per-size deep links repeating `affiliation_type_ids` per player; `onlineBookable: true`; course-config attribution over payload labels
- [ ] 2.9 Add the scraper adapter to the `@stt/scraper-core` `package.json` `exports` map

## 3. Course + pricing config

- [ ] 3.1 Add `platforms/chronogolf-v2/courses/the-willows.ts` exporting a `ChronogolfV2CourseConfig` (`courseId 'the-willows'`, `courseName 'The Willows'`, three physical-loop UUIDs + `'18'` in `courseIds`, `slug`, `affiliationTypeId` per the verified capture, `America/Regina`, `bookingPortalUrl`, `maxAdvanceDays 5`, `releaseTime '07:00'`), with a comment explaining the `'18'` entry is a combined-round toggle that adds no rows
- [ ] 3.2 Export a `CoursePricingConfig` for The Willows grossing the pre-tax scraped fee up by `0.11` (`tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 }`, `rules: []`); add both exports to the `package.json` `exports` map

## 4. Wiring

- [ ] 4.1 In `apps/scraper-local/src/main.ts`, construct `ChronogolfV2Scraper` with The Willows config and the existing host-limited browser `JsonFetcher` (`limitedFetcher`), and add it to the orchestrator's scraper array
- [ ] 4.2 Add The Willows' pricing config to the `PricingEngine` course-config map

## 5. Verify

- [ ] 5.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix all errors
- [ ] 5.2 Run the full test suite green
- [ ] 5.3 Run `apps/scraper-local` against local DynamoDB and confirm The Willows records land for a future date (9- and 18-hole records across loops, `onlineBookable: true`, 9-hole `pricePerPlayer` populated after tax, 18-hole `pricePerPlayer: null`)
