## 1. Fixtures

- [x] 1.1 Pull real WebTrac search-results HTML for each course/hole-count (holiday-park-championship 18 & 9, holiday-park-executive-9 9, silverwood 18 & 9, wildwood 18 & 9), including at least one same-day page exhibiting the "Individual Allowance Rules" phone-only state, and commit them under `packages/scraper-core/src/platforms/webtrac/__fixtures__/` with a short `README.md` documenting how they were captured (URL params, date)

## 2. Transport rename (globalMaxConcurrent)

- [x] 2.1 Rename `browserPageCeiling` → `globalMaxConcurrent` in `transport/request-limiter-config.schema.ts` (field + doc comment)
- [x] 2.2 Update `transport/bottleneck-request-limiter.adapter.ts` references and the "Axis B — global browser-page ceiling" comment to be transport-neutral
- [x] 2.3 Update `apps/scraper-local` config + `main.ts` (env var `SCRAPER_MAX_BROWSER_PAGES` → transport-neutral name, and its usage)
- [x] 2.4 Update the limiter tests to the new field name and run them green

## 3. Text transport stack

- [x] 3.1 Add `transport/text-fetcher.port.ts` defining `TextFetcher { fetchText(url): Promise<string> }`
- [x] 3.2 Add `transport/http-text-fetcher.adapter.ts` (`HttpTextFetcher`) using plain `fetch`, returning the body as text on OK and throwing `TransportError` (with parsed `Retry-After`) on non-OK
- [x] 3.3 Add `transport/host-limited-text-fetcher.adapter.ts` (`HostLimitedTextFetcher`) mirroring `HostLimitedJsonFetcher`, scheduling by URL host through the injected `RequestLimiter`
- [x] 3.4 Add unit tests for `HttpTextFetcher` (OK → text, non-OK → `TransportError` with status/retry-after) and `HostLimitedTextFetcher` (schedules under URL host, substitutable)
- [x] 3.5 Add the three transport files to the `@stt/scraper-core` `package.json` `exports` map

## 4. Bookability schema field

- [ ] 4.1 Add `onlineBookable: boolean` to `BaseTeeTime` in `domain/tee-time.schema.ts` so it lives on both `ScrapedTeeTime` and `TeeTime`
- [ ] 4.2 Update `tee-time.schema` tests and any existing fixtures/builders; ensure chronogolf-v1 scraped records set `onlineBookable: true`
- [ ] 4.3 Confirm `PricingEngine.enrich` passes `onlineBookable` through unchanged (it is in `shared`); add a pass-through test

## 5. Static pricing resolution

- [ ] 5.1 Implement `resolveStatic(scraped, rules)` in `domain/pricing-engine.ts` as first-match rule evaluation: `holes` equality plus optional `daysOfWeek` / `after`/`before` (`[after, before)`) / `dates`, deriving local date, `HH:mm`, and day-of-week from `startInstant`
- [ ] 5.2 Add pricing-engine tests: first-match precedence, hole-count + weekday/weekend narrowing, no-match → `null`, and local day/time derived from the start instant's offset (not UTC)

## 6. WebTrac platform

- [ ] 6.1 Add `platforms/webtrac/webtrac-course-config.ts` (`WebtracCourseConfig extends CourseConfig` with `secondaryCode: number` and `holes: number[]`)
- [ ] 6.2 Add `platforms/webtrac/webtrac-scraper.adapter.ts` (`WebtracScraper implements BookingPlatformScraper`, private configs, injected `TextFetcher`): build the search URL, fan out over hole counts, fetch, parse, concatenate; emit `dynamicPrice: null`
- [ ] 6.3 Implement HTML parsing (cheerio): rows from `table#grwebsearch_output_table tbody tr`; cells by `data-title`; `Date` `MM/DD/YYYY`→`YYYY-MM-DD`; trim `Time`; `Holes` → count + start set; map to the requested course config (ignore page course label)
- [ ] 6.4 Implement row classification: success → `onlineBookable: true`; error + "Individual Allowance Rules" tooltip + `openSlots > 0` → `onlineBookable: false`, empty `bookingUrls`; else drop
- [ ] 6.5 Implement routing (`9→[startSet]`, `18 (Front)→["Front","Back"]`, `18 (Back)→["Back","Front"]`, none→`[]`), `groupSizes = [1..min(openSlots,4)]`, and `startInstant` via the shared local-start-instant util
- [ ] 6.6 Implement per-group-size booking URLs from the absolute add-to-cart href by setting `GlobalSalesArea_GRNumSlots=<size>`
- [ ] 6.7 Add scraper/parser tests driven by the committed fixtures, asserting online-bookable rows, phone-only rows (kept, no URLs), dropped rows, routing, group sizes, and per-size URLs
- [ ] 6.8 Add the WebTrac scraper adapter to the `@stt/scraper-core` `package.json` `exports` map

## 7. Course + pricing configs

- [ ] 7.1 Add `platforms/webtrac/courses/holiday-park-championship.ts` (config: secondaryCode 1, holes [18,9]; pricing rules 18 wk62/wknd70, 9 wk38/wknd42)
- [ ] 7.2 Add `platforms/webtrac/courses/holiday-park-executive-9.ts` (secondaryCode 2, holes [9]; pricing 9 wk31/wknd35)
- [ ] 7.3 Add `platforms/webtrac/courses/silverwood.ts` (secondaryCode 3, holes [18,9]; pricing 18 wk42/wknd45, 9 wk25/wknd27)
- [ ] 7.4 Add `platforms/webtrac/courses/wildwood.ts` (secondaryCode 4, holes [18,9]; pricing 18 wk47/wknd50, 9 wk28/wknd30)
- [ ] 7.5 Each course exports a course config + a `CoursePricingConfig` (weekday `[1,2,3,4]` / weekend `[5,6,0]` rules, after-tax, no `tax`), sets `America/Regina`, `maxAdvanceDays: 7`, `releaseTime: '06:00'`, and a WebTrac `bookingPortalUrl`; add a comment flagging annual green-fee re-verification; add course exports to `package.json`

## 8. Wiring

- [ ] 8.1 In `apps/scraper-local/src/main.ts`, construct `HttpTextFetcher` → its own `HostLimitedTextFetcher` backed by a dedicated `BottleneckRequestLimiter` instance
- [ ] 8.2 Construct `WebtracScraper` with the four course configs + text fetcher and add it to the orchestrator's scraper array
- [ ] 8.3 Add the four WebTrac pricing configs to the `PricingEngine` course-config map

## 9. Verify

- [ ] 9.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix all errors
- [ ] 9.2 Run the full test suite green
- [ ] 9.3 Run `apps/scraper-local` against local DynamoDB and confirm WebTrac records land for a future date (online-bookable, priced) and a same-day date (phone-only, `onlineBookable: false`, no booking URLs)
