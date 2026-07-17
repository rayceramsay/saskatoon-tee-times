## MODIFIED Requirements

### Requirement: Canonical persisted TeeTime schema

The system SHALL define a canonical `TeeTime` schema — the public, persisted representation — extending the shared tee-time shape with `pricePerPlayer` (nullable). For this slice `TeeTime` SHALL be produced as a pass-through of `ScrapedTeeTime`, mapping `pricePerPlayer` directly from `dynamicPrice` with no tax normalization or static-rule resolution. The mapping SHALL preserve the seam's shape so a later pricing engine can replace the pass-through without changing the persisted type or the repository.

#### Scenario: Pass-through maps dynamic price to price per player

- **WHEN** a `ScrapedTeeTime` with `dynamicPrice` is mapped to a `TeeTime`
- **THEN** the resulting `TeeTime.pricePerPlayer` equals the scraped `dynamicPrice` (including null when it was null)
- **AND** the `TeeTime` carries all shared fields (start, course, holes, routing, group sizes, and the `booking` union) unchanged

#### Scenario: The booking union round-trips through the store

- **WHEN** tee times carrying the `reservation`, `portal`, and `phone` arms are written and read back
- **THEN** each record's `booking` returns with the same `kind` and arm payload it was written with
- **AND** no arm is flattened, defaulted, or coerced into another by the store's marshalling
