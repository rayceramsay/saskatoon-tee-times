## MODIFIED Requirements

### Requirement: TeeOn platform scraper

The system SHALL provide a TeeOn `BookingPlatformScraper` implementation that obtains a course's guest tee-time availability as JSON through an injected captured-JSON transport (never a concrete transport) and normalizes it into `ScrapedTeeTime` records. Because TeeOn's guest API is session-gated — its key is injected by the portal SPA and a direct request returns `401` — the scraper SHALL NOT request the API URLs directly; it SHALL drive the course's public portal page (the portal URL with the target `date`) and consume the responses captured from that single navigation. A single `scrape` SHALL capture, from one navigation, both the `guest/tee-time` response for that facility and date and the facility's `guest/facility/settings/tee-sheet` response, so the booking-size rules that govern group sizes are available to the parser. It SHALL keep its per-course configuration private and emit `dynamicPrice: null` for every record.

#### Scenario: TeeOn scrape returns normalized records

- **WHEN** a TeeOn course is scraped for a date
- **THEN** the scraper captures the guest `tee-time` and `settings/tee-sheet` JSON by driving the portal page for that date through the injected captured-JSON transport in one navigation and returns `ScrapedTeeTime` records for that course and date
- **AND** every record carries `dynamicPrice: null`

#### Scenario: Records are attributed to the requested course

- **WHEN** a TeeOn guest response is parsed
- **THEN** each record's `courseId`/`courseName` come from the requested course's configuration rather than the payload's facility/course labels

### Requirement: TeeOn availability and bookability

Every TeeOn scraped record SHALL be `onlineBookable: true` — TeeOn is an online booking portal with no phone-only state. `groupSizes` SHALL be derived from the facility's booking-size rules applied to each start, over the candidate range `[1 .. min(quantity_remaining, 4)]`: a candidate size SHALL be retained only when the facility's rule for that size permits it given the start's open-slot capacity `size` (see the booking-size rules requirement). The resulting `groupSizes` MAY be non-contiguous. Each valid group size SHALL carry a booking URL that is the course's portal URL with the record's `date` applied as the `date` query parameter; TeeOn exposes no per-group-size deep link, so every size SHALL share that same portal-with-date URL. A start bookable at no size SHALL yield no record.

#### Scenario: Single-booking floor lifts on an empty start

- **WHEN** a start reports `quantity_remaining` equal to its `size` (an empty start) and the facility's `single_bookings` rule is `allow_within_group`
- **THEN** its `groupSizes` excludes 1 — e.g. an empty size-4 start yields `[2, 3, 4]`

#### Scenario: Single booking is allowed when joining a partially-filled start

- **WHEN** a start reports `quantity_remaining` less than its `size` (a group already exists) and the facility's `single_bookings` rule is `allow_within_group`
- **THEN** its `groupSizes` includes 1 — e.g. a size-4 start with `quantity_remaining` 1 yields `[1]`

#### Scenario: Each group size gets the portal-with-date booking URL

- **WHEN** a TeeOn record has valid group sizes `[2, 3, 4]`
- **THEN** `bookingUrls` has an entry for each size
- **AND** every entry is the course's portal URL with the record's `date` set as the `date` query parameter
- **AND** the record is `onlineBookable: true`

## ADDED Requirements

### Requirement: TeeOn booking-size rules from tee-sheet settings

The system SHALL derive each TeeOn start's valid group sizes from the facility's booking-size rules rather than assuming a floor of 1. The rules SHALL be parsed from the captured `guest/facility/settings/tee-sheet` response's `single_bookings`, `twosome_bookings`, `threesome_bookings`, and `foursome_bookings` fields into a pure value object, validated with a Zod enum that SHALL reject an unrecognized rule value (failing loudly against the committed fixture) rather than coercing it. Each `guest/tee-time` row's open-slot capacity `size` SHALL be modeled so an empty start (`quantity_remaining` equal to `size`) is distinguishable from a partially-filled one. For a candidate group size `g`, the rule SHALL resolve as: `allow` — bookable; `allow_within_group` — bookable only when the start is partially filled (`quantity_remaining < size`), i.e. a group already exists to join; a disallowing value — not bookable. The derivation SHALL be pure and I/O-free, and SHALL be validated against committed settings and tee-time fixtures.

#### Scenario: Rules parse from the settings fixture

- **WHEN** the committed `settings/tee-sheet` fixture is parsed
- **THEN** it yields a booking-size rules value object carrying the four per-size rule values

#### Scenario: Unknown rule value fails validation

- **WHEN** a `settings/tee-sheet` response carries a `single_bookings` value outside the recognized set
- **THEN** parsing fails validation rather than silently deriving group sizes from an unknown rule

#### Scenario: allow_within_group gates the single size on emptiness

- **WHEN** `single_bookings` is `allow_within_group` and the other sizes are `allow`
- **THEN** an empty start (`quantity_remaining == size`) is bookable at `[2, 3, 4]` and a partially-filled start (`quantity_remaining < size`) is bookable at 1 up to `min(quantity_remaining, 4)`

#### Scenario: Uniformly-allowed rules reproduce the contiguous range

- **WHEN** all four `*_bookings` rules are `allow`
- **THEN** a start's `groupSizes` is the contiguous range `[1 .. min(quantity_remaining, 4)]`
