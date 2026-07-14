## ADDED Requirements

### Requirement: TeeOn platform scraper

The system SHALL provide a TeeOn `BookingPlatformScraper` implementation that obtains a course's guest tee-time availability as JSON through an injected captured-JSON transport (never a concrete transport) and normalizes it into `ScrapedTeeTime` records. Because TeeOn's guest API is session-gated — its key is injected by the portal SPA and a direct request returns `401` — the scraper SHALL NOT request the API URL directly; it SHALL drive the course's public portal page (the portal URL with the target `date`) and consume the captured `guest/tee-time` response for that facility and date. It SHALL keep its per-course configuration private and emit `dynamicPrice: null` for every record.

#### Scenario: TeeOn scrape returns normalized records

- **WHEN** a TeeOn course is scraped for a date
- **THEN** the scraper captures the guest `tee-time` JSON by driving the portal page for that date through the injected captured-JSON transport and returns `ScrapedTeeTime` records for that course and date
- **AND** every record carries `dynamicPrice: null`

#### Scenario: Records are attributed to the requested course

- **WHEN** a TeeOn guest response is parsed
- **THEN** each record's `courseId`/`courseName` come from the requested course's configuration rather than the payload's facility/course labels

### Requirement: TeeOn guest response parsing pinned to fixtures

The system SHALL validate and parse a raw TeeOn guest `tee-time` response into structured tee-time records without performing any network I/O. Only bookable starts SHALL be retained: a row SHALL be dropped unless its `blocked_type` is `open` and its `quantity_remaining` is at least 1. Each retained start SHALL fan out into a 9-hole record whose `routing` is its `division_title`, plus — only when the row carries a back-nine continuation (`turn_tee_time` present with a `turn_division_title`) — an 18-hole record whose `routing` is `[division_title, turn_division_title]`. The `startInstant` SHALL combine the row's `date` and `start_time` with the course's configured time zone. Parsing SHALL be validated against committed JSON fixtures so a change in TeeOn's response shape surfaces as a failing test rather than silent data loss.

#### Scenario: Fixture parses into structured records

- **WHEN** a committed TeeOn guest response fixture is parsed
- **THEN** each retained start yields records with a normalized `startInstant`, `holes`, `routing`, and `groupSizes`
- **AND** a fixture whose shape no longer matches the expected schema fails validation rather than silently dropping fields

#### Scenario: Open start fans out into 9-hole and 18-hole records

- **WHEN** an open start carries a back-nine `turn_tee_time` with a `turn_division_title`
- **THEN** it yields a 9-hole record with `routing` `[division_title]` and an 18-hole record with `routing` `[division_title, turn_division_title]`

#### Scenario: Start without a back-nine continuation yields only 9 holes

- **WHEN** an open start has no `turn_tee_time` (e.g. a late-day start)
- **THEN** it yields only the 9-hole record and no 18-hole record

#### Scenario: Blocked and full starts are dropped

- **WHEN** a row's `blocked_type` is not `open`, or its `quantity_remaining` is zero
- **THEN** it does not appear in the scraped results

### Requirement: TeeOn availability and bookability

Every TeeOn scraped record SHALL be `onlineBookable: true` — TeeOn is an online booking portal with no phone-only state. `groupSizes` SHALL be the contiguous range `[1 .. min(quantity_remaining, 4)]`. Each valid group size SHALL carry a booking URL that is the course's portal URL with the record's `date` applied as the `date` query parameter; TeeOn exposes no per-group-size deep link, so every size SHALL share that same portal-with-date URL.

#### Scenario: Group sizes are contiguous from remaining quantity

- **WHEN** a retained start reports `quantity_remaining` of 3
- **THEN** its `groupSizes` is `[1, 2, 3]`, and a start reporting 6 yields `[1, 2, 3, 4]`

#### Scenario: Each group size gets the portal-with-date booking URL

- **WHEN** a TeeOn record has valid group sizes `[1, 2, 3, 4]`
- **THEN** `bookingUrls` has an entry for each size
- **AND** every entry is the course's portal URL with the record's `date` set as the `date` query parameter
- **AND** the record is `onlineBookable: true`

### Requirement: TeeOn course configuration

A TeeOn course config SHALL extend the universal `CourseConfig` with the TeeOn `facilityId` and the public `portalUrl` used both to drive the capture and to build booking links. A single TeeOn `scrape` SHALL fetch one guest response per course/date. Adding a further TeeOn course SHALL be a configuration-only change — a new course config entry — with no scraper code change. The Legends Golf Club SHALL be configured with its `facilityId`, portal URL, `America/Regina` time zone, and its booking window (`maxAdvanceDays` 5, `releaseTime` `06:00`).

#### Scenario: The Legends is configured as a TeeOn course

- **WHEN** the TeeOn scraper is constructed with The Legends course config
- **THEN** it exposes The Legends among its courses with `courseId` `the-legends`, an `America/Regina` time zone, and a 5-day / `06:00` booking window

#### Scenario: A further TeeOn course is a config-only addition

- **WHEN** another TeeOn course is added
- **THEN** it is introduced as a new course config entry consumed by the same scraper, requiring no change to the TeeOn scraper or parser code
