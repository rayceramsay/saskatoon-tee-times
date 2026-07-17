## 1. Domain schema and config

- [x] 1.1 Add a `Booking` discriminated union to `packages/tee-time-domain/src/tee-time.schema.ts` using `z.discriminatedUnion('kind', ...)` (not `z.union`, so failures report against the matched arm) with three arms: `reservation` (`urls: z.partialRecord(GroupSize, z.string())`), `portal` (`url: z.string()`), `phone` (no payload). Export the type.
- [x] 1.2 Replace `bookingUrls` and `onlineBookable` on `BaseTeeTime` with a single `booking: Booking` field. Add a JSDoc naming the user-effort axis that makes the three arms exhaustive (lands on the slot / find it yourself / not online).
- [x] 1.3 Update `packages/tee-time-domain/src/tee-time.schema.test.ts`: valid records for all three arms, an unknown `kind` failing against the discriminant, and the `phone` arm admitting no URL.
- [x] 1.4 Rewrite `bookingPortalUrl`'s JSDoc in `packages/tee-time-domain/src/course-config.base.ts` to state that a portal is where a golfer books that course — which may be the course's own site, not the booking platform's — and that it holds the bare URL, with any date parameterization applied by the adapter. This comment is the change's one required comment: the distinction is unguessable from `string` and inverting it inverts the field's meaning.
- [x] 1.5 Delete `packages/tee-time-domain/src/best-booking-url.util.ts` and its `./best-booking-url` entry in the package's `exports` map.

## 2. Chronogolf adapters (reservation arm)

- [x] 2.1 In `chronogolf-v1-scraper.adapter.ts`, drop the `bestBookingUrl` import and assign the deep link straight into `booking: { kind: 'reservation', urls }`. Remove `onlineBookable: true`.
- [x] 2.2 In `chronogolf-v2-scraper.adapter.ts`, make the same change.
- [x] 2.3 Update both adapters' test suites to assert `booking.kind === 'reservation'` and read URLs from `booking.urls`, preserving the existing per-size `affiliation_type_ids` and `bookingTld`-vs-scrape-`tld` assertions unchanged.

## 3. WebTrac adapter (reservation and phone arms)

- [x] 3.1 In `webtrac-scraper.adapter.ts`, build `booking` from the existing cart-button classification: a success button yields `{ kind: 'reservation', urls }`, the phone-only tooltip case yields `{ kind: 'phone' }`. Remove the `onlineBookable` field and the empty-map construction it required.
- [x] 3.2 Update `webtrac-scraper.adapter.test.ts` for both arms, keeping the group-size assertions intact — including that a `phone` row still carries its full `groupSizes`.

## 4. TeeOn adapter (portal arm)

- [x] 4.1 Remove `portalUrl` from `TeeOnCourseConfig` (`teeon-course-config.ts`) and from `the-legends.ts`, leaving the base `bookingPortalUrl` as the single declaration. Update the config's JSDoc, which currently describes `portalUrl` as driving both the capture and the booking links.
- [x] 4.2 In `teeon-scraper.adapter.ts`, read `config.bookingPortalUrl` for the `buildPortalUrl` drive target.
- [x] 4.3 In `buildRecords`, replace the per-group-size loop that replicated one URL with a single `booking: { kind: 'portal', url }`. Remove `onlineBookable: true`. Update the JSDoc that documents the "single portal-with-date booking URL" shared across sizes.
- [x] 4.4 Update `teeon-scraper.adapter.test.ts`: the fixture config drops `portalUrl`, and records assert one `portal` url rather than a per-size map. Keep the `single_bookings` group-size scenarios unchanged — they are unaffected by the arm.

## 5. Pricing and persistence

- [x] 5.1 Confirm `pricing-engine.ts` passes `booking` through by spread with no field-level handling; adjust only if it names `onlineBookable` explicitly.
- [x] 5.2 Update `pricing-engine.test.ts`: replace the `onlineBookable` pass-through test with one asserting each of the three arms survives `enrich` unchanged, including that a priced `phone` slot stays `phone`.
- [x] 5.3 Update `dynamodb-tee-time-writer.adapter.integration.test.ts` and `dynamodb-tee-time-reader.adapter.integration.test.ts` to round-trip all three arms and assert no arm is flattened or coerced by marshalling. No adapter code change is expected — the writer spreads the whole `TeeTime`.

## 6. Web app

- [x] 6.1 Mirror the `Booking` union in `apps/web/src/lib/tee-time-response.schema.ts`, replacing `bookingUrls` and `onlineBookable`. Keep it a self-contained copy per the file's existing rationale.
- [x] 6.2 Move party-size URL selection into the reservation arm: `bookingUrlFor` in `derived.util.ts` takes the arm's `urls` (or is inlined into the component), keeping the "selected Players, else max group size" policy.
- [x] 6.3 Rewrite `booking-action.tsx` as an exhaustive switch on `booking.kind`, retiring the defensive `!slot.onlineBookable || href === undefined` guard at line 19. Portal renders "Visit site" with an aria-label conveying that the destination is the course's booking site; reservation keeps "Book for N" and its party-size aria-label; phone keeps "Call to book". Both link arms keep `target="_blank" rel="noopener noreferrer"` and the existing desktop/mobile sizing.
- [x] 6.4 Update `make-tee-time.ts` to default to the `reservation` arm, and check no filter code paths read `booking` — Players filters on `groupSizes` alone.
- [x] 6.5 Update `derived.util.test.ts` and any component tests; add coverage that a `portal` row reads "Visit site" regardless of the Players value, and that all three kinds survive a Players=2 filter identically.

## 7. Verification

- [x] 7.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors. Type-check is the main guard here — every `bookingUrls`/`onlineBookable` reader should surface as an error.
- [x] 7.2 Run `pnpm test` across the workspace, including the persistence integration tests.
- [x] 7.3 Grep for stragglers: `bookingUrls`, `onlineBookable`, `bestBookingUrl`, `portalUrl`, `best-booking-url` should have no live references outside `openspec/changes/archive/`.
- [x] 7.4 Drive the app locally (`/run`) and confirm a Legends row reads "Visit site" and opens the dated portal, a Chronogolf/WebTrac row reads "Book for N" and deep-links, and a phone-only WebTrac row still reads "Call to book".
