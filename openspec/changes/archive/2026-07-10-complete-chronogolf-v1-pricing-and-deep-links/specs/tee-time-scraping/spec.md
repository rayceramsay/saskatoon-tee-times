## RENAMED Requirements

- FROM: `### Requirement: Booking URL resolves to the portal fallback`
- TO: `### Requirement: Booking URL resolves to a per-slot deep link`

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Chronogolf V1 deep-link course configuration

A Chronogolf V1 course config SHALL declare a `slug` (the club's booking URL slug) and a `bookingTld` (the canonical user-facing Chronogolf host suffix), in addition to the existing scrape `tld`. These SHALL be used solely to construct user-facing deep links and SHALL NOT affect which mirror the scraper fetches from.

#### Scenario: Greenbryre config carries a slug and canonical booking host

- **WHEN** the Greenbryre Chronogolf V1 config is loaded
- **THEN** it exposes a `slug` and a `bookingTld` used to build its deep links
- **AND** its scrape `tld` remains free to be tuned as a rate-limit mirror without changing the booking links
