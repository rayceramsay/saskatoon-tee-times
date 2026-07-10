## MODIFIED Requirements

### Requirement: Ingestion pipeline composes ordered stages

The system SHALL provide an `IngestionPipeline` that runs the ordered stages orchestrate → price → persist as a single injected unit, so that entrypoints invoke the pipeline rather than composing stages themselves. Each stage SHALL be independently injectable for testing. The price stage SHALL be the injected `PricingEngine.enrich`, which produces each persisted `TeeTime` by finalizing the scraped record's price; the former pass-through mapper SHALL be removed.

#### Scenario: Pipeline runs orchestrate, price, then persist

- **WHEN** the pipeline's `run` is invoked for the current instant
- **THEN** it orchestrates all bookable `(course, date)` units, enriches each scraped record into a persisted `TeeTime` via the pricing engine, and persists them
- **AND** an entrypoint invoking the pipeline never composes the individual stages itself

#### Scenario: Pricing stage is injected for testing

- **WHEN** the pipeline is constructed with a stubbed pricing stage
- **THEN** `run` uses that stage to produce the persisted `TeeTime` records without depending on the concrete engine
