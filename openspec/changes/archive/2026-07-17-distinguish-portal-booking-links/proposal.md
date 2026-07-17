## Why

The dashboard renders every online-bookable slot with a "Book for N" action, but only some of those links actually book. Chronogolf and WebTrac produce reservation deep links that land on the slot for a specific party size; TeeOn (The Legends) produces a date-filtered link to the course's general booking portal, where the golfer must still find the slot themselves. "Book for 3" is misleading there — the click books nothing, and the 3 has no effect on the destination.

The domain cannot express the difference: `bestBookingUrl` exists specifically to collapse "deep link, else portal" into one opaque string, so the distinction is erased at scrape time and unrecoverable downstream.

## What Changes

- **BREAKING** Replace `TeeTime`/`ScrapedTeeTime`'s `bookingUrls` map and `onlineBookable` boolean with a single `booking` discriminated union with three arms:
  - `{ kind: 'reservation', urls }` — a per-group-size deep link that lands on the slot (Chronogolf V1/V2, WebTrac)
  - `{ kind: 'portal', url }` — one link to the course's booking portal, where the golfer finds the slot themselves (TeeOn)
  - `{ kind: 'phone' }` — not bookable online (WebTrac slots with no cart URL)
- Label portal slots **"Visit site"** instead of "Book for N". Reservation slots keep "Book for N"; phone slots keep "Call to book". The accessible label carries the full description in all three cases.
- **Remove** `bestBookingUrl` (`packages/tee-time-domain/src/best-booking-url.util.ts`). Its two callers pass a non-nullable deep link as the first candidate, so its portal fallback can never fire — it is unreachable code, and the reason the portal case has no vocabulary today.
- **Remove** `TeeOnCourseConfig.portalUrl`, which duplicates the base `CourseConfig.bookingPortalUrl` byte-for-byte in `the-legends.ts`. It only exists because the base field's name was taken by the unreachable fallback. TeeOn's fetcher target and the portal arm's link are the same page by definition, so one field serves both.
- Wire `CourseConfig.bookingPortalUrl` to a real reader for the first time (the portal arm) and correct its JSDoc to state that a *portal* is where a golfer books that course — which may be the course's own site rather than the booking platform's.
- `groupSizes` stays on the slot and is unaffected: the Players filter tests group-size membership, independent of how (or whether) a slot links out.

## Capabilities

### New Capabilities

None. This restructures how existing capabilities model booking links.

### Modified Capabilities

- `tee-time-scraping`: the canonical scraped-tee-time schema replaces `bookingUrls` + `onlineBookable` with the three-arm `booking` union; each platform's booking-URL requirement restates which arm it produces; TeeOn course configuration drops `portalUrl`; course booking-window configuration documents `bookingPortalUrl`'s meaning and its use as the portal arm's link.
- `tee-time-dashboard`: the booking action requirement gains the portal case ("Visit site") and is restated against `booking.kind` rather than `onlineBookable` plus a URL lookup.
- `tee-time-pricing`: the pass-through requirement names `onlineBookable` explicitly; it becomes `booking`.
- `tee-time-persistence`: the stored-field list names "booking URLs"; it becomes the `booking` union.

## Impact

- **Domain**: `tee-time.schema.ts` (base shape), `course-config.base.ts` (JSDoc), deletion of `best-booking-url.util.ts` and its `package.json` export entry.
- **Scrapers**: all four adapters (`chronogolf-v1`, `chronogolf-v2`, `webtrac`, `teeon`) construct the union instead of the map; `teeon-course-config.ts` and `the-legends.ts` drop `portalUrl`.
- **Web**: `tee-time-response.schema.ts`, `booking-action.tsx` (exhaustive switch replaces the `!onlineBookable || href === undefined` guard), `derived.util.ts` (`bookingUrlFor` becomes reservation-arm-internal).
- **API**: no logic change — it passes the `TeeTime` shape through — but the response shape changes for consumers.
- **Persistence**: no code change. The writer spreads the whole `TeeTime` into the item and `replaceUnitTeeTimes` reconciles each scrape unit wholesale, so items converge on the new shape within one 15-minute scrape cycle after deploy. No backfill or dual-read.
- **Tests**: fixtures and expectations across all four adapter suites, `tee-time.schema.test.ts`, `pricing-engine.test.ts`, `derived.util.test.ts`, `make-tee-time.ts`, and the persistence integration tests.
- **Deploy ordering**: the scraper must ship before or with the web app; a stale web bundle reading new items would find no `bookingUrls`. The API tolerates both shapes since it does not read booking fields.
