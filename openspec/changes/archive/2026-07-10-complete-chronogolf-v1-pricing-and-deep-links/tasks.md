## 1. Pricing config and engine (domain)

- [x] 1.1 Add pricing config types in `packages/scraper-core/src/domain`: `CoursePricingConfig { tax?: DynamicPricingTaxRule; rules: PricingRule[] }`, `DynamicPricingTaxRule { scrapedPriceIncludesTax: boolean; taxRate: number }`, and a `PricingRule` shape (holes, optional daysOfWeek/after/before/dates, price) — the rule shape exists for later evaluation even though it is unused now
- [x] 1.2 Implement `applyTax(price, tax, courseId)`: pass through when `scrapedPriceIncludesTax`, else gross up by `taxRate` rounded to two decimals; throw an error naming the course when `tax` is undefined
- [x] 1.3 Implement `resolveStatic(scraped, rules)` as a stub returning `null` (typed for the real evaluation to slot in later)
- [x] 1.4 Implement `PricingEngine` with `enrich(scraped: ScrapedTeeTime): TeeTime`: look up the course's pricing config, drop `dynamicPrice`, set `pricePerPlayer = (dynamicPrice == null ? null : applyTax(...)) ?? resolveStatic(...)`, pass all other fields through
- [x] 1.5 Delete `tee-time.mapper.ts` and its test; the pass-through path is replaced by the engine
- [x] 1.6 Add a `./domain/pricing-engine` entry to `packages/scraper-core/package.json` `exports`

## 2. Wire the pricing stage into the pipeline

- [x] 2.1 Change `IngestionPipeline` so its price stage is the injected `PricingEngine.enrich` (replacing the `mapToTeeTime = toTeeTime` default); keep the stage injectable for tests
- [x] 2.2 Update `apps/scraper-local/src/main.ts` to construct the `PricingEngine` (with Greenbryre's pricing config) and pass it into the `IngestionPipeline`
- [x] 2.3 Apply the same wiring in `apps/scraper-lambda` if it constructs the pipeline — N/A: `apps/scraper-lambda` is a bare `package.json` with no pipeline composition root yet

## 3. Chronogolf V1 deep-link booking URLs

- [x] 3.1 Add `slug: string` and `bookingTld: string` to `ChronogolfV1CourseConfig`, documenting that `bookingTld` is the canonical user-facing host and independent of the scrape `tld` mirror
- [x] 3.2 Add a deep-link builder in the Chronogolf V1 platform: given config (`bookingTld`, `slug`, `affiliationTypeId`), listing (`chronogolfCourseId`, `nbHoles`), `date`, tee-time `id`, and a group size, assemble the reservation-review URL by hand (hash fragment, comma-joined `affiliation_type_ids` repeated once per player)
- [x] 3.3 In `mergeListing`, replace the rung-3 portal `bookingUrls` construction with the deep-link builder per valid group size, keeping `bestBookingUrl` as the candidate-ladder resolver (deep link first, portal fallback last)
- [x] 3.4 Populate `greenbryre.ts` with `slug: 'greenbryre-country-club-closed-until-2013-season'`, `bookingTld: 'ca'`, and a `CoursePricingConfig` (`tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 }`, `rules: []`)

## 4. Tests

- [x] 4.1 `PricingEngine`/`applyTax` unit tests: pre-tax gross-up rounds to cents, tax-inclusive passes through, missing tax rule throws (named course), null dynamic price → null after static stub
- [x] 4.2 Pipeline test: the injected pricing stage produces persisted `TeeTime` records; a stub stage is used and no pass-through mapper remains
- [x] 4.3 Chronogolf V1 scraper fixture test: each valid group size yields a deep link carrying `teetime_id`, listing `course_id`/`nb_holes`, and `date`, with `affiliation_type_ids` repeated per player; assert the scrape `tld` never appears and `bookingTld` host is used
- [x] 4.4 Update Greenbryre fixture-based tests so `pricePerPlayer` reflects the after-tax value (fixtures encode the raw green fee as pre-tax)

## 5. Verify

- [x] 5.1 Run `pnpm format`, `pnpm check-types`, `pnpm lint`, and the test suite; fix all errors
- [x] 5.2 Run a live `scrape("greenbryre", <date>)` (or the local pipeline once): confirm after-tax prices and that a produced deep link opens the correct slot at the correct group size in a browser
