# tee-time-scraping

## Purpose

Scraping tee-time availability from a booking platform for a given course and date, normalized to the canonical `ScrapedTeeTime` schema. Scraping is abstracted per **platform**, with each **course as configuration**. This capability establishes the `BookingPlatformScraper` contract, the scraped-tee-time schema, and the first platform implementation (Chronogolf V1 → Greenbryre).

## Requirements

### Requirement: Booking platform scraper contract

The system SHALL define a `BookingPlatformScraper` contract that exposes a platform identifier, the set of courses the scraper serves, and a `scrape(courseId, date)` operation returning a list of `ScrapedTeeTime` records. Concrete platform scrapers SHALL implement this contract, keeping any platform-specific configuration private to the implementation. A single `scrape` call MAY perform multiple HTTP requests internally; the request count is private to the scraper.

#### Scenario: Scraper reports its platform and courses

- **WHEN** a `BookingPlatformScraper` implementation is constructed with its course configuration
- **THEN** it exposes a stable `platform` identifier
- **AND** it exposes the list of courses it can scrape, each carrying at least a `courseId` and `timeZone`

#### Scenario: Scraping a course for a date returns scraped tee times

- **WHEN** `scrape(courseId, date)` is called for a course the scraper serves
- **THEN** it returns a promise resolving to an array of `ScrapedTeeTime` records for that course and date
- **AND** each record conforms to the canonical scraped-tee-time schema

### Requirement: Canonical scraped-tee-time schema

The system SHALL define a canonical `ScrapedTeeTime` schema, validated with Zod, containing: a `startInstant` (ISO 8601 with the course's local UTC offset), `courseId`, `courseName`, `holes`, `routing`, `groupSizes` (an explicit array of valid group sizes, each one of the closed set 1–4), `bookingUrls` (best-available URL per valid group size), `scrapedAt`, and `dynamicPrice` (the raw per-player price as scraped, or null). Group sizes SHALL be a closed union such that invalid sizes fail validation.

#### Scenario: Valid scraped tee time passes validation

- **WHEN** a record with all required fields and group sizes within 1–4 is validated against the schema
- **THEN** validation succeeds and yields a typed `ScrapedTeeTime`

#### Scenario: Out-of-range group size fails validation

- **WHEN** a record contains a group size outside the closed 1–4 set
- **THEN** schema validation fails rather than silently accepting it

### Requirement: Chronogolf V1 response parsing

The system SHALL validate and parse a raw Chronogolf V1 JSON response into
structured tee-time records without performing any network I/O. The hole count
SHALL be sourced from the `nb_holes` request parameter, not from the response
(whose `hole` field is the starting hole). Response parsing SHALL be validated
against captured fixtures so that a change in the platform's response shape
surfaces as a failing test — independent of how the parsing is factored
internally (whether as a standalone function or private to a platform scraper).

#### Scenario: Response fixture parses into structured records

- **WHEN** a captured Chronogolf V1 response fixture is parsed during scraping
- **THEN** the resulting records expose at least each slot's stable id, start time, restrictions, out-of-capacity flag, and raw green fee
- **AND** a response whose shape no longer matches the expected schema fails validation rather than silently dropping fields

### Requirement: Group-size resolution by merging per-size queries

Because Chronogolf V1 reveals a slot's valid party sizes only per query — and a restriction appears only in a query at a group size it applies to — the scraper SHALL query each group size (1–4) for a given course listing and merge the results by stable tee-time id. A slot SHALL be considered bookable at group size G when, in the size-G query, it has `out_of_capacity` false and no restrictions. The merged `groupSizes` SHALL be exactly the set of sizes at which the slot is bookable, and MAY be non-contiguous. A slot bookable at no size SHALL be dropped.

#### Scenario: Group sizes reflect the sizes at which a slot is bookable

- **WHEN** a slot is bookable (out-of-capacity false, no restrictions) at sizes 2, 3, and 4 but restricted at size 1
- **THEN** its merged `groupSizes` is `[2, 3, 4]`

#### Scenario: Fully booked and no-size slots are excluded

- **WHEN** a slot is out-of-capacity across every group-size query
- **THEN** it does not appear in the merged results

#### Scenario: Raw per-player price is captured untouched

- **WHEN** a bookable query for a slot conveys a green fee
- **THEN** the parsed `dynamicPrice` is that raw per-player number with no tax normalization applied
- **AND** when no bookable query conveys a price, `dynamicPrice` is null

### Requirement: Course listings fan out over sub-courses and hole variants

A Chronogolf V1 course SHALL be configured as one or more listings, each pinning a Chronogolf `course_id`, an `nb_holes` value, and a routing. A single `scrape` SHALL fan out over every listing (each across all group sizes), stamp each resulting record's `holes` from the listing's `nb_holes` and `routing` from the listing's routing, and concatenate the per-listing results.

#### Scenario: Greenbryre fans out over its configured listings

- **WHEN** Greenbryre is scraped for a date
- **THEN** the scraper queries its main course at 12 and 6 holes and its North set at 6 holes, each across group sizes 1–4
- **AND** records from the North listing carry routing `["North"]` while main-course records carry routing `[]`
- **AND** each record's `holes` equals the `nb_holes` of the listing it came from

### Requirement: Booking URL resolves to a per-slot deep link

Each Chronogolf V1 scraped tee time SHALL carry, for each valid group size, a rung-1 reservation-review deep link that targets that exact slot and player count — not the general portal fallback. The deep link SHALL be built inside the scraper from the tee-time `id` already present in the parsed response (zero extra requests), the listing's Chronogolf `course_id` and `nb_holes`, and the course config's `slug`, repeating `affiliation_type_ids` once per player for the group size. The deep link's host SHALL be the course's canonical user-facing booking host (config `bookingTld`), which SHALL be independent of the scrape `tld` mirror so that rate-limit mirror choices never leak into user-facing links. The trivial "first available candidate" policy SHALL still select the deep link over the portal fallback.

#### Scenario: Each valid group size gets a slot-and-size-specific deep link

- **WHEN** a Chronogolf V1 tee time is parsed with valid group sizes `[2, 3, 4]`
- **THEN** `bookingUrls` has an entry for each of 2, 3, and 4
- **AND** each entry is a reservation-review URL carrying the slot's `teetime_id`, the listing's `course_id` and `nb_holes`, and the date
- **AND** the size-2 entry repeats `affiliation_type_ids` twice, size-3 three times, and size-4 four times

#### Scenario: The deep-link host is the canonical booking host, not the scrape mirror

- **WHEN** a course is scraped through a `tld` mirror chosen for rate-limiting that differs from its canonical booking host
- **THEN** the emitted booking URLs use the configured `bookingTld` host
- **AND** the scrape `tld` never appears in any booking URL

### Requirement: Chronogolf V1 deep-link course configuration

A Chronogolf V1 course config SHALL declare a `slug` (the club's booking URL slug) and a `bookingTld` (the canonical user-facing Chronogolf host suffix), in addition to the existing scrape `tld`. These SHALL be used solely to construct user-facing deep links and SHALL NOT affect which mirror the scraper fetches from.

#### Scenario: Greenbryre config carries a slug and canonical booking host

- **WHEN** the Greenbryre Chronogolf V1 config is loaded
- **THEN** it exposes a `slug` and a `bookingTld` used to build its deep links
- **AND** its scrape `tld` remains free to be tuned as a rate-limit mirror without changing the booking links

### Requirement: Course booking-window configuration

The universal `CourseConfig` SHALL carry the course's booking window: `maxAdvanceDays` (the number of days ahead, beyond today, that are bookable) and `releaseTime` (the local `HH:MM` time of day at which the furthest-out date becomes bookable). These fields are platform-independent booking facts and SHALL be populated for every course. Greenbryre's configuration SHALL be updated to declare its booking window.

#### Scenario: Course config declares its booking window

- **WHEN** a `CourseConfig` is defined for an in-scope course
- **THEN** it carries a `maxAdvanceDays` non-negative integer and a `releaseTime` local `HH:MM` string
- **AND** these fields are readable without knowledge of the course's booking platform

#### Scenario: Greenbryre declares a concrete booking window

- **WHEN** the Greenbryre course configuration is loaded
- **THEN** it exposes `maxAdvanceDays` and `releaseTime` values reflecting Greenbryre's booking policy
