## MODIFIED Requirements

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

## ADDED Requirements

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
