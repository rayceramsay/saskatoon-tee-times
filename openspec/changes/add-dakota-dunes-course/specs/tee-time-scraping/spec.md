## ADDED Requirements

### Requirement: Dakota Dunes Chronogolf V1 course configuration

The system SHALL configure Dakota Dunes as a Chronogolf V1 course served by the existing Chronogolf V1 scraper. Its configuration SHALL declare the club's Chronogolf ids (`clubId`, `affiliationTypeId`), a deep-link `slug` and canonical `bookingTld`, a scrape `tld` mirror distinct from every other Chronogolf V1 course, a booking window (`maxAdvanceDays` and `releaseTime`), and two listings that pin a single Chronogolf `course_id` at 18 and 9 holes, each with empty routing. Dakota Dunes SHALL be a pure configuration addition: no change to the Chronogolf V1 scraper, transport, canonical schema, or persistence.

#### Scenario: Dakota Dunes is served as a second Chronogolf V1 course

- **WHEN** the Chronogolf V1 scraper is constructed with the Dakota Dunes configuration
- **THEN** it reports Dakota Dunes among its served courses alongside Greenbryre
- **AND** `scrape` for Dakota Dunes returns `ScrapedTeeTime` records without any adapter change

#### Scenario: Dakota Dunes fans out over one course id at 18 and 9 holes

- **WHEN** Dakota Dunes is scraped for a date
- **THEN** the scraper queries its single Chronogolf `course_id` at 18 holes and at 9 holes, each across group sizes 1–4
- **AND** every resulting record carries empty routing (`[]`)

#### Scenario: Dakota Dunes deep links use its canonical booking host, not the scrape mirror

- **WHEN** a Dakota Dunes tee time is parsed with valid group sizes
- **THEN** each group size's booking URL is a reservation-review deep link on the course's canonical `bookingTld` host carrying the slot's `teetime_id`, `course_id`, `nb_holes`, and date
- **AND** the scrape `tld` mirror never appears in any user-facing booking URL

### Requirement: Dakota Dunes pricing configuration

The system SHALL configure Dakota Dunes with a dynamic `CoursePricingConfig` whose scraped green fee is treated as pre-tax and grossed up by the course's `0.11` tax rate, with no static pricing rules.

#### Scenario: Dakota Dunes green fee is grossed up by tax

- **WHEN** a Dakota Dunes tee time carries a dynamic scraped green fee
- **THEN** the pricing engine resolves `pricePerPlayer` by applying the course's `0.11` tax rate to the pre-tax fee
- **AND** no static pricing rule is consulted
