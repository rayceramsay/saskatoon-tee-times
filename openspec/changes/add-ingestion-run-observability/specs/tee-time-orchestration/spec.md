## MODIFIED Requirements

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
