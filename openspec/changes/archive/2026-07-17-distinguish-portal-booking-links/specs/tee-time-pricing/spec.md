## MODIFIED Requirements

### Requirement: Pricing engine finalizes the scraped price into the canonical tee time

The system SHALL provide a `PricingEngine` whose `enrich(ScrapedTeeTime) → TeeTime` is the single authority for price finalization. It SHALL resolve `pricePerPlayer` in priority order (FR-1.7): (1) the scraped dynamic price, tax-normalized to after-tax CAD; (2) a statically configured price for the slot; (3) `null`. The raw `dynamicPrice` field SHALL NOT appear on the produced `TeeTime`; every other field — including the `booking` union — SHALL pass through unchanged. Pricing SHALL NOT read, narrow, or reconstruct `booking`: how a slot is booked is a fact established at scrape time and is not pricing's to revise.

#### Scenario: Dynamic price is tax-normalized and preferred

- **WHEN** a scraped tee time carries a non-null `dynamicPrice`
- **THEN** `enrich` sets `pricePerPlayer` to that price normalized to after-tax CAD per the course's tax rule
- **AND** the produced `TeeTime` has no `dynamicPrice` field

#### Scenario: Static resolution is attempted only when no dynamic price exists

- **WHEN** a scraped tee time has a null `dynamicPrice`
- **THEN** `enrich` sets `pricePerPlayer` to the statically resolved price, or `null` when none resolves

#### Scenario: Bookability passes through pricing unchanged

- **WHEN** a scraped tee time with a given `booking` union is enriched
- **THEN** the produced `TeeTime` carries the same `booking` value, with the same `kind` and the same arm payload

#### Scenario: Every booking kind survives enrichment

- **WHEN** scraped tee times carrying the `reservation`, `portal`, and `phone` arms are each enriched
- **THEN** each produced `TeeTime` carries its original arm unchanged
- **AND** a priced `phone` slot is still a `phone` slot — having a price does not make it online-bookable
