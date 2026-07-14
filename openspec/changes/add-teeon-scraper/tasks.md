## 1. Fixtures

- [ ] 1.1 Capture real TeeOn guest `tee-time` JSON for The Legends (facility 477) by driving the portal page, and commit under `packages/scraper-core/src/platforms/teeon/__fixtures__/` — include a page exhibiting both 9- and 18-hole starts (rows with `turn_tee_time` + `turn_division_title`) and at least one late-day start lacking `turn_tee_time`, plus a `README.md` documenting how they were captured (portal URL, facility id, date)

## 2. Captured-JSON transport stack

- [ ] 2.1 Add `transport/captured-json-fetcher.port.ts` defining `CapturedJsonFetcher { capture(pageUrl, responseUrlPrefix): Promise<unknown> }`
- [ ] 2.2 Add `transport/playwright-captured-json-fetcher.adapter.ts` (`PlaywrightCapturedJsonFetcher`): lazily launch/share a headless chromium browser + context with a `close()`; in `capture`, register `page.waitForResponse` on the URL-prefix match before `page.goto(pageUrl)`, then read the matched response — throw `TransportError(status, parsedRetryAfter, url)` on non-OK, return parsed JSON on OK (reuse a `parseRetryAfter` mirroring the JSON adapter's)
- [ ] 2.3 Add `transport/host-limited-captured-json-fetcher.adapter.ts` (`HostLimitedCapturedJsonFetcher` implementing `CapturedJsonFetcher`), scheduling by the page URL's host through the injected `RequestLimiter`
- [ ] 2.4 Add unit tests: adapter capture-and-return (OK → parsed JSON; non-OK → `TransportError` with status/retry-after) driven by a stubbed page/response, and the host-limited decorator (schedules under the page URL host, substitutable)
- [ ] 2.5 Add the three transport files to the `@stt/scraper-core` `package.json` `exports` map

## 3. TeeOn platform

- [ ] 3.1 Add `platforms/teeon/teeon-course-config.ts` (`TeeOnCourseConfig extends CourseConfig` with `facilityId: number` and `portalUrl: string`)
- [ ] 3.2 Add `platforms/teeon/teeon-scraper.adapter.ts` (`TeeOnScraper implements BookingPlatformScraper`, `platform = 'teeon'`, private configs, injected `CapturedJsonFetcher`): build the portal URL with `?date=`, capture the guest `tee-time` response by its `guest/tee-time?facility_id=<id>&date=<date>` prefix, parse, and return records; emit `dynamicPrice: null`
- [ ] 3.3 Implement response parsing (Zod): validate the guest array modeling only consumed fields (`start_time`, `date`, `quantity_remaining`, `division_title`, `turn_division_title`, `turn_tee_time`, `blocked_type`); drop rows unless `blocked_type === 'open'` and `quantity_remaining >= 1`
- [ ] 3.4 Implement per-start fan-out: always a 9-hole record (`routing: [division_title]`); an 18-hole record (`routing: [division_title, turn_division_title]`) only when `turn_tee_time` is present and `turn_division_title` is non-null
- [ ] 3.5 Implement `groupSizes = [1 .. min(quantity_remaining, 4)]`, `startInstant` via the shared local-start-instant util, `onlineBookable: true`, and per-group-size `bookingUrls` all set to `portalUrl?date=<date>`
- [ ] 3.6 Add scraper/parser tests driven by the committed fixtures, asserting 9/18-hole fan-out, late-day 9-only, dropped (blocked/full) rows, contiguous group sizes, routing, `onlineBookable: true`, `dynamicPrice: null`, and the shared portal-with-date booking URLs
- [ ] 3.7 Add the TeeOn scraper adapter to the `@stt/scraper-core` `package.json` `exports` map

## 4. Course + pricing config

- [ ] 4.1 Add `platforms/teeon/courses/the-legends.ts` exporting a `TeeOnCourseConfig` (`courseId 'the-legends'`, `courseName 'The Legends'`, `facilityId 477`, portal URL, `America/Regina`, `maxAdvanceDays 5`, `releaseTime '06:00'`) and an empty `CoursePricingConfig` (`{ rules: [] }`); add both to the `package.json` `exports` map
- [ ] 4.2 Add a comment on the empty pricing config flagging that TeeOn pricing is deferred to the follow-up change (per-slot variant resolution unsolved)

## 5. Wiring

- [ ] 5.1 In `apps/scraper-local/src/main.ts`, hoist the browser `BottleneckRequestLimiter` to a shared variable and construct `PlaywrightCapturedJsonFetcher` → `HostLimitedCapturedJsonFetcher` backed by that **same** limiter instance as the Playwright JSON fetcher (shared global page ceiling; per-host caps stay independent by hostname); ensure the captured fetcher's `close()` runs on shutdown alongside the existing fetcher
- [ ] 5.2 Construct `TeeOnScraper` with The Legends config + the captured-JSON fetcher and add it to the orchestrator's scraper array
- [ ] 5.3 Add The Legends' (empty) pricing config to the `PricingEngine` course-config map

## 6. Verify

- [ ] 6.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix all errors
- [ ] 6.2 Run the full test suite green
- [ ] 6.3 Run `apps/scraper-local` against local DynamoDB and confirm The Legends records land for a future date (9- and 18-hole, `onlineBookable: true`, `pricePerPlayer: null`)
