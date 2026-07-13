# tee-time-persistence

## Purpose

Defining the public, persisted representation of a tee time and the port through which it is stored. This capability establishes the canonical `TeeTime` schema (a pass-through of the scraped record for this slice), the transport-agnostic `TeeTimeWriter` port, snapshot-replace persistence semantics keyed by `(courseId, date)`, and the DynamoDB store's key design and TTL-based eviction of past slots.
## Requirements
### Requirement: Canonical persisted TeeTime schema

The system SHALL define a canonical `TeeTime` schema — the public, persisted representation — extending the shared tee-time shape with `pricePerPlayer` (nullable). For this slice `TeeTime` SHALL be produced as a pass-through of `ScrapedTeeTime`, mapping `pricePerPlayer` directly from `dynamicPrice` with no tax normalization or static-rule resolution. The mapping SHALL preserve the seam's shape so a later pricing engine can replace the pass-through without changing the persisted type or the repository.

#### Scenario: Pass-through maps dynamic price to price per player

- **WHEN** a `ScrapedTeeTime` with `dynamicPrice` is mapped to a `TeeTime`
- **THEN** the resulting `TeeTime.pricePerPlayer` equals the scraped `dynamicPrice` (including null when it was null)
- **AND** the `TeeTime` carries all shared fields (start, course, holes, routing, group sizes, booking URLs) unchanged

### Requirement: Tee-time writer port

The system SHALL define a `TeeTimeWriter` port that persistence adapters implement, exposing an operation to replace the stored tee times for a given `(courseId, date)` unit with a supplied set of `TeeTime` records. The port SHALL be transport-agnostic so the domain does not depend on any specific data store. The port name uses `Writer` (rather than `Repository`) to name the write side of persistence explicitly, leaving room for a future read-side port without a lopsided naming pair.

#### Scenario: Writer exposes a snapshot-replace operation keyed by course and date

- **WHEN** the ingestion pipeline needs to persist a unit's scraped result
- **THEN** it calls the writer with the `(courseId, date)` unit and that unit's complete current `TeeTime` set
- **AND** the domain depends only on the port, not on any concrete data store

### Requirement: Snapshot-replace persistence semantics

Persisting a `(courseId, date)` unit SHALL make the store's contents for that unit exactly equal the supplied set: records present in the store but absent from the new set SHALL be removed, and records in the new set SHALL be written. A tee time's stored identity SHALL be `(courseId, startInstant, holes, routing)`, so that otherwise-identical slots differing only by routing (e.g. a 9-hole front vs a 9-hole back at the same time) are distinct records. Persistence SHALL be self-healing: because each run supplies the complete current set, a partially applied or missed write SHALL be fully reconciled by a subsequent run.

#### Scenario: Vanished slots are removed on replace

- **WHEN** a unit previously stored a slot that is absent from the newly scraped set for the same `(courseId, date)`
- **THEN** after the replace that slot is no longer present in the store

#### Scenario: Routing distinguishes otherwise-identical slots

- **WHEN** two tee times share course, start instant, and hole count but differ in routing
- **THEN** they are stored and reconciled as two distinct records rather than one overwriting the other

### Requirement: Store keying and past-slot eviction

The DynamoDB-backed store SHALL key items with a partition key of the local date (`YYYY-MM-DD`) and a sort key composed of `courseId`, `startInstant`, `holes`, and `routing`, so that all courses' times for a date share a partition (efficient future per-date reads) while a single unit's items are addressable by the `courseId` sort-key prefix (efficient per-unit reconciliation). Each item SHALL carry a numeric TTL attribute derived from its `startInstant` so that past dates, whose partitions are no longer scraped, are evicted automatically (satisfying removal of passed tee times without an explicit sweep).

#### Scenario: Item keys support per-date read and per-unit write

- **WHEN** a `TeeTime` is written
- **THEN** its partition key is the local date and its sort key begins with its `courseId`
- **AND** a unit's existing items can be listed by querying the date partition for the `courseId` sort-key prefix

#### Scenario: Past slots carry a TTL for automatic eviction

- **WHEN** a `TeeTime` is written
- **THEN** it carries a numeric TTL attribute equal to its start instant expressed as epoch seconds
- **AND** once that instant has passed the item is eligible for automatic eviction

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

