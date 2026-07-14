## Why

Dakota Dunes is one of the eight in-scope Saskatoon-area courses (PRD §7) and books through Chronogolf V1 — the same platform the dashboard already scrapes for Greenbryre. Its scraper exists; only the course is missing. Adding it is a configuration change, moving the product one course closer to full coverage.

## What Changes

- Add Dakota Dunes as a second Chronogolf V1 course: a new `courses/dakota-dunes.ts` declaring its club/course/affiliation ids, deep-link `slug`, scrape/booking TLDs, booking window, and two listings (a single Chronogolf `course_id` fanned out at 18 and 9 holes, both with empty routing).
- Add Dakota Dunes' `CoursePricingConfig`: dynamic-priced with a pre-tax scraped green fee grossed up by the course's `0.11` tax rate; no static rules (same shape as Greenbryre).
- Wire both configs into the local scraper composition root (`apps/scraper-local`): add the config to the `ChronogolfV1Scraper` course list and the pricing config to the pricing-engine map.
- No scraper adapter, transport, schema, or persistence changes.

## Capabilities

### New Capabilities
<!-- None — this change adds a course to an existing platform; no new capability is introduced. -->

### Modified Capabilities

- `tee-time-scraping`: adds Dakota Dunes as a configured Chronogolf V1 course (single `course_id` fanned out at 18 and 9 holes with empty routing, a midnight-release 7-day booking window, and a dynamic pre-tax pricing config), exercising the existing Chronogolf V1 listing fan-out, deep-link, and booking-window requirements with a second course.

## Impact

- **Code (`@stt/scraper-core`)**: new `platforms/chronogolf-v1/courses/dakota-dunes.ts` (config + pricing config); new `package.json` `exports` entry for the course.
- **Composition root (`apps/scraper-local`)**: additive wiring — Dakota Dunes joins the existing `ChronogolfV1Scraper` instance (reusing its browser-`JsonFetcher` limiter) and the pricing-engine map.
- **External dependency**: adds a live scrape dependency on Dakota Dunes' Chronogolf V1 club (`clubId` 19739) via the `ie` mirror; the scrape `tld` is chosen so no other V1 course shares it (Greenbryre uses `es`).
- **No adapter/schema/persistence change**: `chronogolf-v1` is already a valid platform; `ScrapedTeeTime`/`TeeTime` shapes and the persistence key are unchanged.
- **Booking-window behavior**: a `releaseTime` of `00:00` means Dakota Dunes' furthest date (today + 7) is bookable all day, so it fans out to 8 dates on every run — the existing `bookableDates` logic produces this with no code change.
