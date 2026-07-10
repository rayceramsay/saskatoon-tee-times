## ADDED Requirements

### Requirement: Bookable dates derived from a course's booking window

The system SHALL provide a `bookableDates(config, now)` domain utility that expands a course's booking window into the ordered list of local calendar dates (`YYYY-MM-DD`) to scrape. The list SHALL start at the course's current local date and extend through `maxAdvanceDays` days ahead. The furthest-out date SHALL be included only once the course's local time has reached its `releaseTime`; before `releaseTime`, that final date SHALL be excluded. All date and time reasoning SHALL be performed in the course's configured `timeZone`, never in UTC or the host's local zone.

#### Scenario: Window expands to the full range after release time

- **WHEN** `bookableDates` is called for a course with `maxAdvanceDays` of N and the course's local time is at or after `releaseTime`
- **THEN** it returns the ordered dates from today through today plus N days, inclusive, in the course's time zone

#### Scenario: Furthest date withheld before release time

- **WHEN** the course's local time is before `releaseTime`
- **THEN** the returned list excludes the furthest-out date (today plus `maxAdvanceDays`) and includes the rest

### Requirement: Orchestrated fan-out with per-unit failure isolation

The system SHALL provide an orchestrator that expands the configured scrapers into `(scraper, courseId, date)` work units — one per course per bookable date — and executes them concurrently. A failure of one unit SHALL NOT prevent other units from completing; a failed unit SHALL contribute no records and SHALL be surfaced (logged), while successful units' records are flattened into a single result. The orchestrator SHALL NOT itself pace or throttle requests.

#### Scenario: All units fan out and flatten

- **WHEN** the orchestrator runs over scrapers whose courses expand to multiple bookable dates
- **THEN** it scrapes every `(course, date)` unit and returns the concatenation of all successful units' `ScrapedTeeTime` records

#### Scenario: One failing unit does not abort the run

- **WHEN** one `(course, date)` unit's scrape rejects while others succeed
- **THEN** the run completes and returns the records from the successful units
- **AND** the failing unit contributes no records and its failure is surfaced rather than silently swallowed

### Requirement: Ingestion pipeline composes ordered stages

The system SHALL provide an `IngestionPipeline` that runs the ordered stages orchestrate → persist as a single injected unit, so that entrypoints invoke the pipeline rather than composing stages themselves. Each stage SHALL be independently injectable for testing. The pricing stage is intentionally absent in this slice; the persisted `TeeTime` is produced as a pass-through of the scraped record (see the persistence capability).

#### Scenario: Pipeline runs orchestrate then persist

- **WHEN** the pipeline's `run` is invoked for the current instant
- **THEN** it orchestrates all bookable `(course, date)` units, maps the scraped records to persisted `TeeTime` records, and persists them
- **AND** an entrypoint invoking the pipeline never composes the individual stages itself
