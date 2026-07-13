## MODIFIED Requirements

### Requirement: Tee-time writer port

The system SHALL define a `TeeTimeWriter` port that persistence adapters implement, exposing an operation to replace the stored tee times for a given `(courseId, date)` unit with a supplied set of `TeeTime` records. The port SHALL be transport-agnostic so the domain does not depend on any specific data store. The port name uses `Writer` (rather than `Repository`) to name the write side of persistence explicitly, leaving room for a future read-side port without a lopsided naming pair.

#### Scenario: Writer exposes a snapshot-replace operation keyed by course and date

- **WHEN** the ingestion pipeline needs to persist a unit's scraped result
- **THEN** it calls the writer with the `(courseId, date)` unit and that unit's complete current `TeeTime` set
- **AND** the domain depends only on the port, not on any concrete data store
