## 1. Multi-target captured-JSON transport

- [x] 1.1 Change the `CapturedJsonFetcher` port to `capture(pageUrl, targets: Record<string, string>): Promise<Record<string, unknown>>` and update its JSDoc.
- [x] 1.2 Update `PlaywrightCapturedJsonFetcher` to register a `waitForResponse` per target before `page.goto`, await all, and resolve the label-keyed parsed bodies; keep the `TransportError` behavior on any non-OK captured response.
- [x] 1.3 Update `HostLimitedCapturedJsonFetcher` to the new signature; host still derived from `pageUrl`.
- [x] 1.4 Update the adapter tests: multi-target capture returns keyed bodies, single-target still works, non-OK on any target throws `TransportError`, limiter still schedules by page host.

## 2. Booking-size rules value object

- [x] 2.1 Add `platforms/teeon/teeon-booking-size-rules.ts`: a Zod schema for the four `*_bookings` fields (enum rejecting unknown values) and a `BookingSizeRules` value object with `bookableGroupSizes(quantityRemaining, slotSize): GroupSize[]`.
- [x] 2.2 Unit-test the interpretation directly: `allow`, `allow_within_group` on empty vs partially-filled, a disallowing value, all-`allow` reproduces the contiguous range, and a non-contiguous result.

## 3. TeeOn scraper wiring

- [x] 3.1 Model `size` on `RawTeeOnTeeTime`.
- [x] 3.2 In `scrape`, build the two response prefixes (tee-time + settings) and capture both in one `capture` call; parse the settings into `BookingSizeRules`.
- [x] 3.3 Replace `buildGroupSizes(quantityRemaining)` with rule-driven derivation using `size` and the parsed rules; drop starts bookable at no size.
- [x] 3.4 Thread the rules through `buildRecords` so the 9-hole and 18-hole records share the derived `groupSizes`.

## 4. Fixtures and parser tests

- [x] 4.1 Confirm the committed `the-legends-settings-tee-sheet.json` and `the-legends-2026-07-15.json` fixtures are wired into the tests.
- [x] 4.2 Add scraper/parser tests: the 2:48pm empty start yields `[2, 3, 4]`, the 12:00 partially-filled start yields `[1]`, and shape/enum drift fails validation.

## 5. Verification

- [x] 5.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors.
- [x] 5.2 Run the scraper-core test suite and confirm the July 15 restricted-slot behavior matches TeeOn's UI.
