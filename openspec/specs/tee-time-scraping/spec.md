# tee-time-scraping

## Purpose

Scraping tee-time availability from a booking platform for a given course and date, normalized to the canonical `ScrapedTeeTime` schema. Scraping is abstracted per **platform**, with each **course as configuration**. This capability establishes the `BookingPlatformScraper` contract, the scraped-tee-time schema, and the platform implementations (Chronogolf V1 → Greenbryre; WebTrac → the Saskatoon municipal courses).

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

The system SHALL define a canonical `ScrapedTeeTime` schema, validated with Zod, containing: a `startInstant` (ISO 8601 with the course's local UTC offset), `courseId`, `courseName`, `holes`, `routing`, `groupSizes` (an explicit array of valid group sizes, each one of the closed set 1–4), `bookingUrls` (best-available URL per valid group size), `onlineBookable` (a boolean stating whether the slot can be booked online at scrape time), `scrapedAt`, and `dynamicPrice` (the raw per-player price as scraped, or null). Group sizes SHALL be a closed union such that invalid sizes fail validation. `onlineBookable` SHALL be a field on the shared base shape so that it flows through pricing to the canonical `TeeTime` unchanged.

#### Scenario: Valid scraped tee time passes validation

- **WHEN** a record with all required fields, group sizes within 1–4, and a boolean `onlineBookable` is validated against the schema
- **THEN** validation succeeds and yields a typed `ScrapedTeeTime`

#### Scenario: Out-of-range group size fails validation

- **WHEN** a record contains a group size outside the closed 1–4 set
- **THEN** schema validation fails rather than silently accepting it

#### Scenario: Bookability is explicit, not inferred from booking URLs

- **WHEN** a scraped tee time has an empty `bookingUrls` map
- **THEN** whether it is bookable is read from its explicit `onlineBookable` flag rather than inferred from the absence of URLs

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

### Requirement: WebTrac platform scraper

The system SHALL provide a WebTrac `BookingPlatformScraper` implementation for Saskatoon Leisure municipal courses that fetches search-results HTML over a plain-HTTP text transport and parses it with cheerio into `ScrapedTeeTime` records. It SHALL keep its per-course configuration private, depend on an injected `TextFetcher` (never a concrete transport), and emit `dynamicPrice: null` for every record — WebTrac green fees are resolved downstream by the pricing engine, never by the scraper. The search request SHALL target the WebTrac search endpoint with the course's `secondaryCode`, the date formatted as `MM/DD/YYYY`, the requested hole count, and a fixed single-player detail-view query.

#### Scenario: WebTrac scrape returns normalized records

- **WHEN** a WebTrac course is scraped for a date
- **THEN** the scraper fetches the search HTML through the injected `TextFetcher` and returns `ScrapedTeeTime` records for that course and date
- **AND** every record carries `dynamicPrice: null`

#### Scenario: Records are attributed to the requested course, not the page label

- **WHEN** a WebTrac results page shows an ambiguous or differently-worded course label (e.g. "Holiday Park 18 Hole")
- **THEN** each record's `courseId`/`courseName` come from the requested course's configuration, not from the page's course cell

### Requirement: WebTrac HTML parsing pinned to fixtures

The system SHALL parse a WebTrac search-results page by reading rows from the results table (`table#grwebsearch_output_table tbody tr`), extracting each row's `Course`, `Date`, `Time`, `Open Slots`, and `Holes` cells addressed by their `data-title` attributes, and normalizing them. The response `Date` (`MM/DD/YYYY`) SHALL be converted to `YYYY-MM-DD`; the `Time` cell SHALL be trimmed of leading whitespace before normalization. The `Holes` cell (e.g. `18 (Front)`, `9 (Back)`) SHALL yield the hole count plus an optional starting set. Parsing SHALL be validated against committed HTML fixtures so a change in WebTrac's markup surfaces as a failing test.

#### Scenario: Fixture parses into structured records

- **WHEN** a committed WebTrac results fixture is parsed
- **THEN** each retained row yields a record with a normalized `startInstant`, `holes`, `routing`, and `groupSizes`
- **AND** a fixture whose markup no longer matches the expected structure fails parsing rather than silently dropping rows

#### Scenario: Holes cell drives routing

- **WHEN** a 9-hole row's `Holes` cell names a starting set
- **THEN** its `routing` is that single set
- **WHEN** an 18-hole row's `Holes` cell is `18 (Front)`
- **THEN** its `routing` is `["Front", "Back"]`, and `18 (Back)` yields `["Back", "Front"]`
- **WHEN** the `Holes` cell names no set
- **THEN** `routing` is empty

### Requirement: WebTrac availability and phone-only bookability

WebTrac rows SHALL be classified by their add-to-cart button. A row with a success cart button and a real booking href SHALL be retained as `onlineBookable: true`. A row whose cart button is in the error state but whose tooltip indicates the "Individual Allowance Rules" phone-only condition, and which reports at least one open slot, SHALL be retained as `onlineBookable: false` with an empty `bookingUrls` map — these are genuinely available slots that cannot be booked online (e.g. same-day), and SHALL NOT be dropped or given a substitute portal link. A row with no open slots, an error button without the phone-only tooltip, or no cart button SHALL be dropped. `groupSizes` SHALL be the contiguous range `[1 .. min(openSlots, 4)]`.

#### Scenario: Online-bookable row is retained with a booking link

- **WHEN** a row has a success cart button with a real href and open slots
- **THEN** it is retained with `onlineBookable: true` and a booking URL for each group size

#### Scenario: Phone-only available row is retained without a booking link

- **WHEN** a row's cart button is in the error state with an "Individual Allowance Rules" tooltip and reports one or more open slots
- **THEN** it is retained with `onlineBookable: false` and an empty `bookingUrls` map

#### Scenario: Unavailable rows are dropped

- **WHEN** a row reports zero open slots, or has an error button without the phone-only tooltip, or has no cart button
- **THEN** it does not appear in the scraped results

#### Scenario: Group sizes are contiguous from open slots

- **WHEN** a retained row reports 3 open slots
- **THEN** its `groupSizes` is `[1, 2, 3]`, and a row with 6 open slots yields `[1, 2, 3, 4]`

### Requirement: WebTrac booking URL per group size

Each online-bookable WebTrac scraped tee time SHALL carry, for each valid group size, the row's add-to-cart URL with the slot count set to that group size (the `GlobalSalesArea_GRNumSlots` query parameter). The add-to-cart href SHALL be used as parsed (it is absolute) with only the slot-count parameter adjusted per size. Phone-only slots carry no booking URLs.

#### Scenario: Each group size gets a slot-count-specific cart URL

- **WHEN** an online-bookable WebTrac tee time has valid group sizes `[1, 2, 3]`
- **THEN** `bookingUrls` has an entry for each of 1, 2, and 3
- **AND** each entry is the row's cart URL with `GlobalSalesArea_GRNumSlots` set to that size

### Requirement: WebTrac course configuration

A WebTrac course config SHALL extend the universal `CourseConfig` with a `secondaryCode` (the WebTrac course selector) and the ordered `holes` counts the course offers. A single WebTrac `scrape` SHALL fan out over each configured hole count, fetching one search page per count and concatenating the parsed results. The four Saskatoon municipal courses (Holiday Park championship, Holiday Park executive-9, Silverwood, Wildwood) SHALL each be configured with their `secondaryCode`, offered hole counts, `America/Regina` time zone, and a 7-day / `06:00` booking window.

#### Scenario: WebTrac course fans out over its hole counts

- **WHEN** a WebTrac course offering 18 and 9 holes is scraped for a date
- **THEN** the scraper fetches one search page for 18 holes and one for 9 holes and concatenates the parsed results
- **AND** each record's `holes` reflects the page it came from
