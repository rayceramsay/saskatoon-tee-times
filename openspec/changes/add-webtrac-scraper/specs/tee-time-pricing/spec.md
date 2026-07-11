## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Static price resolution is a deferred stub

**Reason**: Superseded by real first-match static rule resolution, which the WebTrac (static-priced) courses now require.
**Migration**: No consumer migration needed — the `resolveStatic` signature and the `PricingEngine` contract are unchanged; a course with no dynamic price and no matching static rule still resolves to `null`. See the new "Static price resolution by first-match rule" requirement.

## ADDED Requirements

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
