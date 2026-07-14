## Context

The Chronogolf V1 platform scraper (`packages/scraper-core/src/platforms/chronogolf-v1/`) is complete and in production for Greenbryre. Its adapter fans out over a course's configured `listings` (each a `chronogolfCourseId` + `nbHoles` + `routing`) across group sizes 1–4, merges availability by stable tee-time id, builds per-size reservation-review deep links, and returns canonical `ScrapedTeeTime` records. A course is expressed entirely as a `ChronogolfV1CourseConfig`, so adding Dakota Dunes touches no adapter code.

The concrete Chronogolf ids were reverse-engineered previously and are recorded in the technical spike (`../saskatoon-tee-times/backend/src/scraping/chronogolf-v1/courses.ts`): `clubId` 19739, a single `course_id` 27975, `affiliationTypeId` 146788, `slug` `dakota-dunes-golf-links`, `holes` `[18, 9]`, `routing` null, scrape `tld` `ie`. The spike's `parse.ts` grosses the scraped green fee up via `withTax` at a `0.11` rate, confirming Dakota Dunes' fee is pre-tax — identical to Greenbryre's v4 pricing config.

## Goals / Non-Goals

**Goals:**

- Add Dakota Dunes to the running scrape as a Chronogolf V1 course, producing correct availability, group sizes, deep links, and after-tax pricing.
- Keep it a pure configuration addition: no adapter, transport, schema, or persistence change.
- Mirror the established Greenbryre course-file shape so future V1 courses stay config-only.

**Non-Goals:**

- Any change to the Chronogolf V1 adapter, fan-out, merge, or deep-link logic.
- Production composition wiring (`apps/scraper-lambda` is still a shell; the live composition root is `apps/scraper-local`).
- Static pricing rules — Dakota Dunes is dynamic-priced, so `rules` stays empty.

## Decisions

### Translate the spike's single `holes: [18, 9]` entry into two v4 listings

The spike modeled hole variants as an array on one course entry; v4's `ChronogolfV1CourseConfig` models each `(course_id, nbHoles, routing)` combination as a separate `listing`. So the one spike entry becomes two listings — `{ chronogolfCourseId: 27975, nbHoles: 18, routing: [] }` and `{ chronogolfCourseId: 27975, nbHoles: 9, routing: [] }` — exactly the shape shift Greenbryre's `[12, 6]` went through. Both share the single `course_id`; the adapter already handles multiple listings on one id.

### Leave routing empty for both listings

Dakota Dunes exposes one physical course id with no per-nine set metadata in the response, and it is not established whether an 18-hole round could start on the back nine. Rather than assert `["Front", "Back"]` that the feed cannot confirm, both listings use `routing: []`, consistent with how Greenbryre's main course is configured. `routing: []` is the schema's documented "unknown" value.

### Scrape `tld` `ie`; `bookingTld` `ca`

The scrape `tld` is a rate-limit lever that pins which Chronogolf mirror the scraper fetches from; the rule is one distinct mirror per V1 course to spread load. Greenbryre uses `es`, so Dakota Dunes takes `ie` (unused, confirmed by the user and matching the spike). `bookingTld` is the canonical user-facing host (`ca`) and is independent of the scrape mirror, so the mirror choice never leaks into booking URLs — a property the adapter already enforces and the spec covers.

### Pricing: dynamic, pre-tax, `0.11`, no rules

Dakota Dunes' Chronogolf response includes a green fee, and the spike confirms it is pre-tax. Its `CoursePricingConfig` is therefore `{ tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 }, rules: [] }` — byte-for-byte Greenbryre's shape. Static rules are unnecessary because a dynamic price is available.

## Risks / Trade-offs

- **Reverse-engineered ids drift** → The `clubId`/`course_id`/`affiliationTypeId`/`slug` are external and could change if Dakota Dunes reconfigures its Chronogolf club. Mitigation: parser/response validation is Zod-backed, so a shape change surfaces as a red parse rather than silent data loss; a run returning zero tee times is already surfaced by ingestion observability.
- **`releaseTime: '00:00'` widens fan-out** → A midnight release means the furthest date (today + 7) is bookable all day, so `bookableDates` always yields 8 dates for Dakota Dunes (vs. 7 before 6 AM for the `06:00` courses). This is the correct, intended behavior and adds one course's worth of extra `(course, date)` units per run; the request limiter already paces V1 fetches.
- **Shared Chronogolf host under a new mirror** → Dakota Dunes' `ie` mirror still resolves to Chronogolf's shared infrastructure; if rate-limiting appears, the `tld` can be retuned freely (it is user-facing-inert), exactly as Greenbryre's mirror was changed to `es`.
