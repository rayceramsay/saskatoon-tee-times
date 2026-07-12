# tee-time-pricing

## Purpose

Finalizing a scraped tee time's price into the canonical `TeeTime` via a shared `PricingEngine`. This capability owns price resolution priority (dynamic → static → null), per-course pricing configuration, tax normalization of scraped prices, and first-match static-rule resolution, keeping price authority out of the scraper and the orchestration pipeline.

## Requirements

### Requirement: Pricing engine finalizes the scraped price into the canonical tee time

The system SHALL provide a `PricingEngine` whose `enrich(ScrapedTeeTime) → TeeTime` is the single authority for price finalization. It SHALL resolve `pricePerPlayer` in priority order (FR-1.7): (1) the scraped dynamic price, tax-normalized to after-tax CAD; (2) a statically configured price for the slot; (3) `null`. The raw `dynamicPrice` field SHALL NOT appear on the produced `TeeTime`; every other field — including `onlineBookable` — SHALL pass through unchanged.

#### Scenario: Dynamic price is tax-normalized and preferred

- **WHEN** a scraped tee time carries a non-null `dynamicPrice`
- **THEN** `enrich` sets `pricePerPlayer` to that price normalized to after-tax CAD per the course's tax rule
- **AND** the produced `TeeTime` has no `dynamicPrice` field

#### Scenario: Static resolution is attempted only when no dynamic price exists

- **WHEN** a scraped tee time has a null `dynamicPrice`
- **THEN** `enrich` sets `pricePerPlayer` to the statically resolved price, or `null` when none resolves

#### Scenario: Bookability passes through pricing unchanged

- **WHEN** a scraped tee time with a given `onlineBookable` value is enriched
- **THEN** the produced `TeeTime` carries the same `onlineBookable` value

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

### Requirement: Static price resolution by first-match rule

Static price resolution SHALL evaluate a course's ordered `rules` against a scraped tee time and return the after-tax `price` of the first matching rule, or `null` when none matches. A rule matches when the tee time's hole count equals the rule's `holes` and every present narrowing field is satisfied: `daysOfWeek` (0 = Sunday) contains the tee time's local day of week; the local start time is at or after `after` and strictly before `before`; and `dates` contains the tee time's local date. Omitted narrowing fields match anything. The local date, local `HH:mm`, and local day of week SHALL be derived from the scraped `startInstant`, which already carries the course's local UTC offset — no separate time-zone lookup is needed. Rule ordering SHALL be significant: the first matching rule wins.

#### Scenario: First matching rule wins

- **WHEN** a course's ordered rules include two rules whose predicates both match a tee time
- **THEN** the price returned is that of the earlier rule in the list

#### Scenario: Hole count and day-of-week narrow a rule

- **WHEN** a WebTrac course configures an 18-hole weekday rule (`daysOfWeek: [1,2,3,4]`) and an 18-hole weekend rule (`daysOfWeek: [5,6,0]`)
- **THEN** an 18-hole tee time on a Wednesday resolves to the weekday price and one on a Saturday resolves to the weekend price

#### Scenario: No matching rule resolves to null

- **WHEN** no configured rule's predicates match the tee time (e.g. an unpriced hole count)
- **THEN** static resolution returns `null` and `pricePerPlayer` is `null`

#### Scenario: Local day and time come from the start instant's offset

- **WHEN** a rule narrows by `daysOfWeek` or `after`/`before`
- **THEN** the tee time's local day of week and local `HH:mm` are read from its `startInstant` offset, not from UTC
