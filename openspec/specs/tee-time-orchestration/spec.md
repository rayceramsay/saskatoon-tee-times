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

### Requirement: Scraper composition is a shared factory across runtimes

The system SHALL compose the ingestion pipeline in a single injectable factory that every scraper runtime calls, rather than in a per-runtime entrypoint. The factory SHALL own the wiring that is identical across runtimes: the request limiters, the transports and their host-limited decorators, every platform scraper and the course configurations registered to it, the orchestrator, and the pricing engine. It SHALL return an `IngestionPipeline` ready to run.

The scraper SHALL be a single package with one entrypoint per runtime. Deployment target SHALL be a build-time choice — which entrypoint is bundled — and SHALL NOT be a package boundary, because what drives a change to scraper composition (adding a course) changes every runtime identically. Runtime-only concerns (scheduling, local store bootstrap) SHALL live in the entrypoint that needs them, so that a bundler tracing imports from another entrypoint never reaches them.

The course registry SHALL be structured so that registering a course is a single edit: the platform scraper's configurations and the pricing engine's `courseId`-keyed map SHALL both derive from one registration, never from two lists maintained in parallel.

#### Scenario: Every runtime composes through the same factory

- **WHEN** a scraper runtime needs an ingestion pipeline
- **THEN** it obtains it from the shared factory rather than wiring the stages itself
- **AND** no runtime holds a second copy of the composition

#### Scenario: Adding a course is a single edit

- **WHEN** a new course is registered in the composition factory
- **THEN** it is scraped by its platform's scraper and priced by the pricing engine
- **AND** no second registration is required for either to see it

#### Scenario: Runtime-only concerns stay out of the shared factory

- **WHEN** an entrypoint requires scheduling or local store bootstrap
- **THEN** that concern lives in the entrypoint, not the factory
- **AND** an entrypoint that does not need it does not reach it through the factory

### Requirement: The composition factory allocates nothing that must be closed

The composition factory SHALL NOT construct, acquire, or own any resource requiring release — no database client, no browser session, no process, no socket. Every closeable resource SHALL be created by the runtime-specific entrypoint, injected into the factory as an already-live collaborator, and released by that same entrypoint. Non-closeable collaborators built on top of a closeable resource (such as a writer over a database client) SHALL likewise be constructed by the entrypoint and injected, so that the factory never holds the handle whose lifetime it does not control.

This SHALL apply regardless of how many resources a runtime holds, and SHALL be the mechanism by which browser lifetime — the one genuine difference between a long-running scraper runtime and a serverless one — is expressed. A long-running runtime MAY keep an injected browser session warm across scheduled runs; a serverless runtime SHALL close its session before the invocation returns. Neither choice SHALL require a change to the factory.

#### Scenario: Factory receives live collaborators, not handles to build them from

- **WHEN** the composition factory is called
- **THEN** it receives an already-constructed writer, browser session, and logger
- **AND** it receives no database client or table name from which it would construct a writer itself

#### Scenario: The entrypoint owns every teardown

- **WHEN** a scraper runtime shuts down or an invocation completes
- **THEN** the entrypoint releases every resource it created
- **AND** the pipeline returned by the factory exposes no teardown of its own

#### Scenario: Browser lifetime differs per runtime without changing the factory

- **WHEN** a long-running runtime keeps one injected browser session across many scheduled runs, and a serverless runtime closes its session before returning
- **THEN** both call the same factory with the same signature
- **AND** neither runtime's lifetime policy is encoded in the composition
