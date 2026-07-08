## ADDED Requirements

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

The system SHALL provide a pure function that validates and parses a raw Chronogolf V1 JSON response into structured tee-time records, without performing any network I/O. The hole count SHALL be sourced from the `nb_holes` request parameter, not from the response (whose `hole` field is the starting hole). The parse function SHALL be tested against captured fixtures so that a change in the platform's response shape surfaces as a failing test.

#### Scenario: Response fixture parses into structured records

- **WHEN** the parse function receives a captured Chronogolf V1 response fixture
- **THEN** it returns structured records exposing at least each slot's stable id, start time, restrictions, out-of-capacity flag, and raw green fee
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

### Requirement: Booking URL resolves to the portal fallback

For this slice, each scraped tee time SHALL carry a booking URL for each valid group size resolved to the course's general booking portal (the rung-3 fallback). Chronogolf V1 carries no per-tee-time deep link, so more specific rungs are out of scope for this slice.

#### Scenario: Every valid group size maps to the portal URL

- **WHEN** a tee time is parsed with a set of valid group sizes
- **THEN** `bookingUrls` contains an entry for each valid group size
- **AND** each entry is the course's configured booking portal URL
