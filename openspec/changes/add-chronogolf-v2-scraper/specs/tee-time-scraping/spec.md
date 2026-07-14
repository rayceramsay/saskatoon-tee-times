## ADDED Requirements

### Requirement: Chronogolf V2 platform scraper

The system SHALL provide a Chronogolf V2 `BookingPlatformScraper` implementation that obtains a course's tee-time availability as JSON from the Chronogolf `/marketplace/v2/teetimes` endpoint through an injected `JsonFetcher` (never a concrete transport) and normalizes it into `ScrapedTeeTime` records. Because the V2 feed is paginated, a single `scrape` SHALL request `page=1,2,3…` sequentially — each request carrying the course's configured `course_ids`, the target `start_date`, and the `page` — stopping at the first page whose `teetimes` array is empty, then parse and concatenate the retrieved pages. It SHALL keep its per-course configuration private.

#### Scenario: Chronogolf V2 scrape returns normalized records

- **WHEN** a Chronogolf V2 course is scraped for a date
- **THEN** the scraper fetches the `/marketplace/v2/teetimes` pages for that course and date through the injected `JsonFetcher` and returns `ScrapedTeeTime` records for that course and date

#### Scenario: Pagination walks until an empty page

- **WHEN** the feed returns tee times on pages 1 and 2 and an empty `teetimes` array on page 3
- **THEN** the scraper requests pages 1, 2, and 3, stops at the empty page, and returns the records parsed from pages 1 and 2

#### Scenario: Records are attributed to the requested course

- **WHEN** a Chronogolf V2 response is parsed
- **THEN** each record's `courseId`/`courseName` come from the requested course's configuration rather than the payload's course labels

### Requirement: Chronogolf V2 response parsing pinned to fixtures

The system SHALL validate and parse a raw Chronogolf V2 `/marketplace/v2/teetimes` response into structured tee-time records without performing any network I/O. Each tee time's group sizes SHALL be taken inline from the contiguous range `[min_player_size .. max_player_size]`; a tee time whose range yields no sizes SHALL be dropped. Each retained tee time SHALL fan out over its `course.bookable_holes`, emitting one record per hole count, and the `startInstant` SHALL combine the response's `date` and `start_time` with the course's configured time zone. Parsing SHALL be validated against committed JSON fixtures so a change in Chronogolf's V2 response shape surfaces as a failing test rather than silent data loss.

#### Scenario: Fixture parses into structured records

- **WHEN** a committed Chronogolf V2 response fixture is parsed
- **THEN** each retained tee time yields records with a normalized `startInstant`, `holes`, `routing`, and `groupSizes`
- **AND** a fixture whose shape no longer matches the expected schema fails validation rather than silently dropping fields

#### Scenario: Group sizes are the inline contiguous range

- **WHEN** a tee time reports `min_player_size` 1 and `max_player_size` 3
- **THEN** its records' `groupSizes` is `[1, 2, 3]`

#### Scenario: A tee time fans out over its bookable hole counts

- **WHEN** a tee time on the `Lakes` loop reports `bookable_holes` `[9, 18]`
- **THEN** it yields a 9-hole record and an 18-hole record, each with `routing` `["Lakes"]`

### Requirement: Chronogolf V2 same-time starts on different loops are preserved

Because a Chronogolf V2 course can expose several physical loops under one `courseId`, the scraper SHALL preserve each loop's start as a distinct record even when two loops share the same wall-clock start time — it SHALL NOT deduplicate by start time. Each record's `routing` SHALL be the single starting-loop name (`course.name`) so that same-time starts on different loops remain distinct under the persistence key.

#### Scenario: Two loops with the same start time yield distinct records

- **WHEN** the `Lakes` and `Xena` loops each have a tee time at the same start time
- **THEN** the scraper emits a record for each, one with `routing` `["Lakes"]` and one with `routing` `["Xena"]`, at the same `startInstant`

### Requirement: Chronogolf V2 availability and pricing

Every Chronogolf V2 scraped record SHALL be `onlineBookable: true` — Chronogolf V2 is an online booking marketplace with no phone-only state. A record's `dynamicPrice` SHALL be the raw per-player green fee from `default_price` only when `default_price.bookable_holes` equals the record's hole count; otherwise it SHALL be `null`. Because the V2 feed prices only the 9-hole round, the 18-hole record of a fanned-out start SHALL carry `dynamicPrice: null`. No tax normalization SHALL be applied by the scraper.

#### Scenario: The priced hole count carries the raw fee

- **WHEN** a tee time's `default_price` reports a green fee scoped to `bookable_holes` 9
- **THEN** its 9-hole record's `dynamicPrice` is that raw per-player number with no tax applied

#### Scenario: The unpriced hole count carries a null price

- **WHEN** the same tee time also yields an 18-hole record
- **THEN** that 18-hole record's `dynamicPrice` is `null`

### Requirement: Chronogolf V2 booking URL per group size

Each Chronogolf V2 scraped tee time SHALL carry, for each valid group size, a rung-1 reservation-review deep link that targets that exact slot and player count — not the general portal fallback. The deep link SHALL be built inside the scraper from the tee-time `id` already present in the parsed response (zero extra requests), the record's hole count (`nb_holes`), the course config's `slug`, and `engine=2`, repeating `affiliation_type_ids` once per player for the group size. The trivial "first available candidate" policy SHALL still select the deep link over the portal fallback.

#### Scenario: Each valid group size gets a slot-and-size-specific deep link

- **WHEN** a Chronogolf V2 tee time is parsed with valid group sizes `[1, 2, 3]`
- **THEN** `bookingUrls` has an entry for each of 1, 2, and 3
- **AND** each entry is a reservation-review URL carrying the slot's `teetime_id`, the record's `nb_holes`, and `engine=2`
- **AND** the size-1 entry repeats `affiliation_type_ids` once, size-2 twice, and size-3 three times

### Requirement: Chronogolf V2 course configuration

A Chronogolf V2 course config SHALL extend the universal `CourseConfig` with the Chronogolf `courseIds` (the `course_ids` sent on every request), the club `slug` (used to build deep links), the `affiliationTypeId` (repeated per player in deep links), and the scrape `tld`. A single `scrape` SHALL send all configured `courseIds` on every page request. Adding a further Chronogolf V2 course SHALL be a configuration-only change — a new course config entry — with no scraper code change. The Willows SHALL be configured with its three physical-loop course UUIDs plus the `18` combined-round toggle in `courseIds`, its `slug` and `affiliationTypeId`, an `America/Regina` time zone, and its booking window (`maxAdvanceDays` 5, `releaseTime` `07:00`).

#### Scenario: The Willows is configured as a Chronogolf V2 course

- **WHEN** the Chronogolf V2 scraper is constructed with The Willows course config
- **THEN** it exposes The Willows among its courses with `courseId` `the-willows`, an `America/Regina` time zone, and a 5-day / `07:00` booking window

#### Scenario: A further Chronogolf V2 course is a config-only addition

- **WHEN** another Chronogolf V2 course is added
- **THEN** it is introduced as a new course config entry consumed by the same scraper, requiring no change to the Chronogolf V2 scraper or parser code
