## ADDED Requirements

### Requirement: Tee-time reader port

The system SHALL define a `TeeTimeReader` port that persistence adapters implement, exposing an operation to read all stored `TeeTime` records for a given local calendar date (`YYYY-MM-DD`). The port SHALL be transport-agnostic so the domain and API depend only on the interface, not on any specific data store. The `Reader`/`Writer` pair names the read and write sides of persistence explicitly.

#### Scenario: Reader exposes a per-date read operation

- **WHEN** a consumer needs the tee times for a date
- **THEN** it calls the reader with that `YYYY-MM-DD` date and receives that date's complete `TeeTime` set
- **AND** it depends only on the port, not on any concrete data store

### Requirement: DynamoDB per-date read

The DynamoDB-backed reader SHALL return a date's tee times with a single `Query` on the date partition key, reconstructing each `TeeTime` from the stored item. Because all courses' times for a date share one partition, the read SHALL NOT require a scan or secondary index. The reader SHALL page through the query until the full partition is returned.

#### Scenario: All of a date's courses returned from one partition

- **WHEN** the reader is asked for a date whose partition holds tee times across multiple courses
- **THEN** it queries the single date partition and returns every course's tee times for that date

#### Scenario: Large partitions are fully paged

- **WHEN** a date's partition exceeds a single query page
- **THEN** the reader continues paging until all items for that date are returned

### Requirement: Missing table reads as empty

When the underlying table does not exist, the reader SHALL resolve to an empty tee time set rather than raising an error, so that a read side started before the table is provisioned degrades gracefully instead of crashing.

#### Scenario: Reading before the table exists

- **WHEN** the reader queries a date but the table has not yet been created
- **THEN** it returns an empty tee time set without raising an error
