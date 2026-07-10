# tee-time-pricing

## Purpose

Finalizing a scraped tee time's price into the canonical `TeeTime` via a shared `PricingEngine`. This capability owns price resolution priority (dynamic → static → null), per-course pricing configuration, tax normalization of scraped prices, and the deferred static-rule stub, keeping price authority out of the scraper and the orchestration pipeline.

## Requirements

### Requirement: Pricing engine finalizes the scraped price into the canonical tee time

The system SHALL provide a `PricingEngine` whose `enrich(ScrapedTeeTime) → TeeTime` is the single authority for price finalization. It SHALL resolve `pricePerPlayer` in priority order (FR-1.7): (1) the scraped dynamic price, tax-normalized to after-tax CAD; (2) a statically configured price for the slot; (3) `null`. The raw `dynamicPrice` field SHALL NOT appear on the produced `TeeTime`; every other field SHALL pass through unchanged.

#### Scenario: Dynamic price is tax-normalized and preferred

- **WHEN** a scraped tee time carries a non-null `dynamicPrice`
- **THEN** `enrich` sets `pricePerPlayer` to that price normalized to after-tax CAD per the course's tax rule
- **AND** the produced `TeeTime` has no `dynamicPrice` field

#### Scenario: Static resolution is attempted only when no dynamic price exists

- **WHEN** a scraped tee time has a null `dynamicPrice`
- **THEN** `enrich` sets `pricePerPlayer` to the statically resolved price, or `null` when none resolves

### Requirement: Per-course pricing configuration

Pricing SHALL be a shared engine parameterized by per-course configuration `{ tax?, rules }`, keyed by `courseId`. The `tax` rule (`{ scrapedPriceIncludesTax, taxRate }`) SHALL be present for any course that produces a dynamic price and MAY be omitted for static-only courses. Static `rules` SHALL be configurable per course as an ordered list, authored after-tax.

#### Scenario: Greenbryre is configured with a pre-tax dynamic tax rule

- **WHEN** the pricing engine enriches a Greenbryre tee time whose scraped green fee is pre-tax
- **THEN** the configured tax rule marks the scraped price as not tax-inclusive with the course's tax rate
- **AND** `pricePerPlayer` equals the scraped price grossed up by that tax rate, rounded to cents

### Requirement: Tax normalization fails loud on misconfiguration

Tax normalization SHALL apply the course's tax rule: a tax-inclusive scraped price passes through, and a non-inclusive scraped price is grossed up by the tax rate and rounded to two decimals. When a non-null dynamic price is enriched for a course with no configured tax rule, the engine SHALL throw rather than guess.

#### Scenario: Missing tax rule for a dynamic price throws

- **WHEN** `enrich` is given a non-null `dynamicPrice` for a course whose pricing config has no `tax` rule
- **THEN** the engine throws an error naming the course rather than emitting an unnormalized price

#### Scenario: Tax-inclusive scraped price passes through untouched

- **WHEN** a course's tax rule marks the scraped price as already tax-inclusive
- **THEN** the resolved after-tax price equals the scraped price

### Requirement: Static price resolution is a deferred stub

For this change, static price resolution SHALL be a stub that always returns `null`, so a course with no dynamic price and no future static rules resolves to a null `pricePerPlayer`. The configuration shape SHALL already accommodate ordered static rules so that rule evaluation can be added later without changing the engine's contract or the persisted schema.

#### Scenario: A course with no dynamic price resolves to null for now

- **WHEN** `enrich` is given a scraped tee time with null `dynamicPrice`
- **THEN** static resolution returns `null` and `pricePerPlayer` is `null`
