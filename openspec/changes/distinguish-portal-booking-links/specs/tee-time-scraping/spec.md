## ADDED Requirements

### Requirement: Booking portal configuration

The universal `CourseConfig` SHALL carry a `bookingPortalUrl`: the page a golfer goes to in order to book that course. This SHALL be understood as the course's *portal*, not its booking *platform* — for several courses the portal is the course's own site (e.g. Greenbryre's `greenbryre.com/book-a-tee-time/`) rather than the platform that backs it (`chronogolf.ca`). The platform is an implementation detail the golfer never sees. This distinction SHALL be documented on the field itself, because it is not inferable from the field's type and misreading it inverts the field's meaning.

`bookingPortalUrl` SHALL hold the bare portal URL. Any per-scrape parameterization (such as a date filter) SHALL be applied by the platform adapter that needs it, not stored in the config. For a course whose scraper drives its portal page to obtain availability, `bookingPortalUrl` SHALL be the single source for both the drive target and the emitted portal link, since for such a course they are by definition the same page.

#### Scenario: Every course config declares its booking portal

- **WHEN** a `CourseConfig` is defined for an in-scope course
- **THEN** it carries a `bookingPortalUrl` naming where a golfer books that course
- **AND** the value is readable without knowledge of the course's booking platform

#### Scenario: A portal may be the course's own site rather than the platform's

- **WHEN** the Greenbryre course configuration is loaded
- **THEN** its `bookingPortalUrl` is the course's own booking page, not the Chronogolf platform host
- **AND** this is a correct value, not an inconsistency to be normalized toward the platform host

## MODIFIED Requirements

### Requirement: Canonical scraped-tee-time schema

The system SHALL define a canonical `ScrapedTeeTime` schema, validated with Zod, containing: a `startInstant` (ISO 8601 with the course's local UTC offset), `courseId`, `courseName`, `holes`, `routing`, `groupSizes` (an explicit array of valid group sizes, each one of the closed set 1–4), `booking` (a discriminated union stating how the slot can be booked), `scrapedAt`, and `dynamicPrice` (the raw per-player price as scraped, or null). Group sizes SHALL be a closed union such that invalid sizes fail validation. `booking` SHALL be a field on the shared base shape so that it flows through pricing to the canonical `TeeTime` unchanged.

The `booking` union SHALL be discriminated on `kind` and SHALL have exactly three arms, distinguished by how much work the golfer does to reach the specific slot:

- `{ kind: 'reservation', urls }` — the slot is directly bookable online. `urls` SHALL map each valid group size to a deep link targeting that exact slot and party size.
- `{ kind: 'portal', url }` — the slot is bookable online, but only after the golfer locates it themselves on the course's booking portal. `url` SHALL be a single link; the arm SHALL NOT carry per-group-size structure, because no per-size destination exists.
- `{ kind: 'phone' }` — the slot is available but cannot be booked online. The arm SHALL carry no URL.

These three arms SHALL be exhaustive and mutually exclusive: a slot is bookable online directly, bookable online after a search, or not bookable online. There SHALL NOT be a fourth state, and the arms SHALL NOT compose (a portal link that is also phone-only does not exist).

Bookability SHALL be expressed solely by `booking.kind`. The schema SHALL NOT carry a separate boolean bookability flag alongside the union, so that "bookable with no URL" and "phone-only with a deep link" are unrepresentable rather than merely invalid.

#### Scenario: Valid scraped tee time passes validation

- **WHEN** a record with all required fields, group sizes within 1–4, and a well-formed `booking` union is validated against the schema
- **THEN** validation succeeds and yields a typed `ScrapedTeeTime`

#### Scenario: Out-of-range group size fails validation

- **WHEN** a record contains a group size outside the closed 1–4 set
- **THEN** schema validation fails rather than silently accepting it

#### Scenario: Bookability is read from the union's discriminant

- **WHEN** a consumer needs to know whether and how a slot can be booked
- **THEN** it reads `booking.kind` and handles all three arms exhaustively
- **AND** there is no separate flag that could disagree with the union

#### Scenario: An unknown booking kind fails validation

- **WHEN** a record carries a `booking.kind` outside the three defined arms
- **THEN** schema validation fails, reporting against the discriminant rather than every arm

#### Scenario: The phone arm cannot carry a booking URL

- **WHEN** a record is constructed with `kind: 'phone'`
- **THEN** the schema admits no URL field on that arm

### Requirement: Booking URL resolves to a per-slot deep link

Each Chronogolf V1 scraped tee time SHALL carry `booking` with `kind: 'reservation'`, whose `urls` map holds, for each valid group size, a rung-1 reservation-review deep link that targets that exact slot and player count. The deep link SHALL be built inside the scraper from the tee-time `id` already present in the parsed response (zero extra requests), the listing's Chronogolf `course_id` and `nb_holes`, and the course config's `slug`, repeating `affiliation_type_ids` once per player for the group size. The deep link's host SHALL be the course's canonical user-facing booking host (config `bookingTld`), which SHALL be independent of the scrape `tld` mirror so that rate-limit mirror choices never leak into user-facing links. The deep link SHALL be used directly: Chronogolf V1 always yields one, so the scraper SHALL NOT route it through a portal-fallback selection step.

#### Scenario: Each valid group size gets a slot-and-size-specific deep link

- **WHEN** a Chronogolf V1 tee time is parsed with valid group sizes `[2, 3, 4]`
- **THEN** its `booking.kind` is `reservation` and `booking.urls` has an entry for each of 2, 3, and 4
- **AND** each entry is a reservation-review URL carrying the slot's `teetime_id`, the listing's `course_id` and `nb_holes`, and the date
- **AND** the size-2 entry repeats `affiliation_type_ids` twice, size-3 three times, and size-4 four times

#### Scenario: The deep-link host is the canonical booking host, not the scrape mirror

- **WHEN** a course is scraped through a `tld` mirror chosen for rate-limiting that differs from its canonical booking host
- **THEN** the emitted booking URLs use the configured `bookingTld` host
- **AND** the scrape `tld` never appears in any booking URL

### Requirement: Chronogolf V2 booking URL per group size

Each Chronogolf V2 scraped tee time SHALL carry `booking` with `kind: 'reservation'`, whose `urls` map holds, for each valid group size, a rung-1 reservation-review deep link that targets that exact slot and player count. The deep link SHALL be built inside the scraper from the tee-time `id` already present in the parsed response (zero extra requests), the record's hole count (`nb_holes`), the course config's `slug`, and `engine=2`, repeating `affiliation_type_ids` once per player for the group size. The deep link's host SHALL be the course config's canonical `bookingTld`, never the scrape `tld` mirror, so mirror choices made for rate-limiting never reach user-facing links. The deep link SHALL be used directly: Chronogolf V2 always yields one, so the scraper SHALL NOT route it through a portal-fallback selection step.

#### Scenario: Each valid group size gets a slot-and-size-specific deep link

- **WHEN** a Chronogolf V2 tee time is parsed with valid group sizes `[1, 2, 3]`
- **THEN** its `booking.kind` is `reservation` and `booking.urls` has an entry for each of 1, 2, and 3
- **AND** each entry is a reservation-review URL carrying the slot's `teetime_id`, the record's `nb_holes`, and `engine=2`
- **AND** the size-1 entry repeats `affiliation_type_ids` once, size-2 twice, and size-3 three times

### Requirement: WebTrac availability and phone-only bookability

WebTrac rows SHALL be classified by their add-to-cart button. A row with a success cart button and a real booking href SHALL be retained with `booking.kind: 'reservation'`. A row whose cart button is in the error state but whose tooltip indicates the "Individual Allowance Rules" phone-only condition, and which reports at least one open slot, SHALL be retained with `booking.kind: 'phone'` — these are genuinely available slots that cannot be booked online (e.g. same-day), and SHALL NOT be dropped or given a substitute portal link. A row with no open slots, an error button without the phone-only tooltip, or no cart button SHALL be dropped. `groupSizes` SHALL be the contiguous range `[1 .. min(openSlots, 4)]`.

#### Scenario: Online-bookable row is retained with a booking link

- **WHEN** a row has a success cart button with a real href and open slots
- **THEN** it is retained with `booking.kind` `reservation` and a URL for each group size

#### Scenario: Phone-only available row is retained without a booking link

- **WHEN** a row's cart button is in the error state with an "Individual Allowance Rules" tooltip and reports one or more open slots
- **THEN** it is retained with `booking.kind` `phone`, and the schema affords it no URL to carry

#### Scenario: Unavailable rows are dropped

- **WHEN** a row reports zero open slots, or has an error button without the phone-only tooltip, or has no cart button
- **THEN** it does not appear in the scraped results

#### Scenario: Group sizes are unaffected by booking kind

- **WHEN** a retained row reports 3 open slots
- **THEN** its `groupSizes` is `[1, 2, 3]`, and a row with 6 open slots yields `[1, 2, 3, 4]`
- **AND** this holds identically for a phone-only row, whose group sizes remain filterable despite carrying no link

### Requirement: WebTrac booking URL per group size

Each online-bookable WebTrac scraped tee time SHALL carry `booking` with `kind: 'reservation'`, whose `urls` map holds, for each valid group size, the row's add-to-cart URL with the slot count set to that group size (the `GlobalSalesArea_GRNumSlots` query parameter). The add-to-cart href SHALL be used as parsed (it is absolute) with only the slot-count parameter adjusted per size. Phone-only slots carry the `phone` arm and no URL.

#### Scenario: Each group size gets a slot-count-specific cart URL

- **WHEN** an online-bookable WebTrac tee time has valid group sizes `[1, 2, 3]`
- **THEN** its `booking.kind` is `reservation` and `booking.urls` has an entry for each of 1, 2, and 3
- **AND** each entry is the row's cart URL with `GlobalSalesArea_GRNumSlots` set to that size

### Requirement: TeeOn availability and bookability

Every TeeOn scraped record SHALL carry `booking` with `kind: 'portal'` — TeeOn is an online booking portal with no phone-only state, and it exposes no per-slot, per-size deep link, so a golfer must find the slot on the portal themselves. `groupSizes` SHALL be derived from the facility's booking-size rules applied to each start, over the candidate range `[1 .. min(quantity_remaining, 4)]`: a candidate size SHALL be retained only when the facility's rule for that size permits it given the start's open-slot capacity `size` (see the booking-size rules requirement). The resulting `groupSizes` MAY be non-contiguous. The `portal` arm's single `url` SHALL be the course's `bookingPortalUrl` with the record's `date` applied as the `date` query parameter. Because the destination does not vary by party size, the record SHALL NOT replicate that URL per group size. A start bookable at no size SHALL yield no record.

#### Scenario: Single-booking floor lifts on an empty start

- **WHEN** a start reports `quantity_remaining` equal to its `size` (an empty start) and the facility's `single_bookings` rule is `allow_within_group`
- **THEN** its `groupSizes` excludes 1 — e.g. an empty size-4 start yields `[2, 3, 4]`

#### Scenario: Single booking is allowed when joining a partially-filled start

- **WHEN** a start reports `quantity_remaining` less than its `size` (a group already exists) and the facility's `single_bookings` rule is `allow_within_group`
- **THEN** its `groupSizes` includes 1 — e.g. a size-4 start with `quantity_remaining` 1 yields `[1]`

#### Scenario: The record carries one portal-with-date link, not one per size

- **WHEN** a TeeOn record has valid group sizes `[2, 3, 4]`
- **THEN** its `booking.kind` is `portal` and it carries a single `url`
- **AND** that `url` is the course's `bookingPortalUrl` with the record's `date` set as the `date` query parameter
- **AND** its `groupSizes` remains `[2, 3, 4]`, unaffected by the absence of per-size links

### Requirement: TeeOn course configuration

A TeeOn course config SHALL extend the universal `CourseConfig` with the TeeOn `facilityId`. It SHALL NOT declare its own portal URL field: the page the scraper drives and the page the portal arm links to are the same page, and both SHALL be read from the base `CourseConfig.bookingPortalUrl`. A single TeeOn `scrape` SHALL fetch one guest response per course/date. Adding a further TeeOn course SHALL be a configuration-only change — a new course config entry — with no scraper code change. The Legends Golf Club SHALL be configured with its `facilityId`, `bookingPortalUrl`, `America/Regina` time zone, and its booking window (`maxAdvanceDays` 5, `releaseTime` `06:00`).

#### Scenario: The Legends is configured as a TeeOn course

- **WHEN** the TeeOn scraper is constructed with The Legends course config
- **THEN** it exposes The Legends among its courses with `courseId` `the-legends`, an `America/Regina` time zone, and a 5-day / `06:00` booking window

#### Scenario: The portal URL is declared once

- **WHEN** The Legends course config is loaded
- **THEN** it declares its portal URL only as the base `bookingPortalUrl`
- **AND** the scraper drives that URL for the target date and emits that same URL, dated, as the record's portal link

#### Scenario: A further TeeOn course is a config-only addition

- **WHEN** another TeeOn course is added
- **THEN** it is introduced as a new course config entry consumed by the same scraper, requiring no change to the TeeOn scraper or parser code
