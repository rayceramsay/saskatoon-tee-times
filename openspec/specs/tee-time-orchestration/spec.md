# tee-time-orchestration

## Purpose

Coordinating the scraping stage across every in-scope course and its bookable dates, then composing the end-to-end ingestion flow. This capability derives the set of dates to scrape from each course's booking window, fans out `(scraper, courseId, date)` work units with per-unit failure isolation, and defines the `IngestionPipeline` that runs the ordered stages (orchestrate → price → persist) as a single injected unit.

## Requirements

### Requirement: Bookable dates derived from a course's booking window

The system SHALL provide a `bookableDates(config, now)` domain utility that expands a course's booking window into the ordered list of local calendar dates (`YYYY-MM-DD`) to scrape. The list SHALL start at the course's current local date and extend through `maxAdvanceDays` days ahead. The furthest-out date SHALL be included only once the course's local time has reached its `releaseTime`; before `releaseTime`, that final date SHALL be excluded. All date and time reasoning SHALL be performed in the course's configured `timeZone`, never in UTC or the host's local zone.

#### Scenario: Window expands to the full range after release time

- **WHEN** `bookableDates` is called for a course with `maxAdvanceDays` of N and the course's local time is at or after `releaseTime`
- **THEN** it returns the ordered dates from today through today plus N days, inclusive, in the course's time zone

#### Scenario: Furthest date withheld before release time

- **WHEN** the course's local time is before `releaseTime`
- **THEN** the returned list excludes the furthest-out date (today plus `maxAdvanceDays`) and includes the rest

### Requirement: Orchestrated fan-out with per-unit failure isolation

The system SHALL provide an orchestrator that expands the configured scrapers into `(scraper, courseId, date)` work units — one per course per bookable date — and executes them concurrently. A failure of one unit SHALL NOT prevent other units from completing; a failed unit SHALL contribute no records and SHALL be surfaced (logged), while successful units' records are flattened together. The orchestrator SHALL NOT itself pace or throttle requests.

The orchestrator SHALL return a structured result that carries both the flattened `ScrapedTeeTime` records from the successful units and the per-unit outcomes of the run, rather than a bare record array. The per-unit outcomes SHALL identify each unit and distinguish success from failure, so that a caller can total how many units succeeded versus failed and how many records each contributed without re-deriving that information from logs.

#### Scenario: All units fan out and flatten

- **WHEN** the orchestrator runs over scrapers whose courses expand to multiple bookable dates
- **THEN** its result's records are the concatenation of all successful units' `ScrapedTeeTime` records
- **AND** its result includes one success outcome per unit identifying the unit and its record count

#### Scenario: One failing unit does not abort the run

- **WHEN** one `(course, date)` unit's scrape rejects while others succeed
- **THEN** the run completes and the result's records contain the records from the successful units
- **AND** the failing unit contributes no records, its failure is surfaced rather than silently swallowed, and the result includes a failure outcome identifying that unit

### Requirement: Ingestion pipeline composes ordered stages

The system SHALL provide an `IngestionPipeline` that runs the ordered stages orchestrate → price → persist as a single injected unit, so that entrypoints invoke the pipeline rather than composing stages themselves. Each stage SHALL be independently injectable for testing. The price stage SHALL be the injected `PricingEngine.enrich`, which produces each persisted `TeeTime` by finalizing the scraped record's price; the former pass-through mapper SHALL be removed.

#### Scenario: Pipeline runs orchestrate, price, then persist

- **WHEN** the pipeline's `run` is invoked for the current instant
- **THEN** it orchestrates all bookable `(course, date)` units, enriches each scraped record into a persisted `TeeTime` via the pricing engine, and persists them
- **AND** an entrypoint invoking the pipeline never composes the individual stages itself

#### Scenario: Pricing stage is injected for testing

- **WHEN** the pipeline is constructed with a stubbed pricing stage
- **THEN** `run` uses that stage to produce the persisted `TeeTime` records without depending on the concrete engine
