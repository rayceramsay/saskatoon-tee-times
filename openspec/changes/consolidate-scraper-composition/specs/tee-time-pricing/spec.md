# tee-time-pricing

## MODIFIED Requirements

### Requirement: Per-course pricing configuration

Pricing SHALL be a shared engine parameterized by per-course configuration `{ tax?, rules }`, keyed by `courseId`. The `tax` rule (`{ scrapedPriceIncludesTax, taxRate }`) SHALL be present for any course that produces a dynamic price and MAY be omitted for static-only courses. Static `rules` SHALL be configurable per course as an ordered list, authored after-tax.

A course's pricing configuration SHALL be a required `pricing` field on the universal `CourseConfig`, declared alongside the course's other platform-independent facts (`timeZone`, `maxAdvanceDays`, `releaseTime`). Every course produces tee times that must be priced, so the relationship is mandatory and SHALL be enforced by the type system rather than by a convention observed at the composition root: a course configuration without a pricing configuration SHALL NOT compile. A course SHALL NOT declare its pricing configuration as a separate artifact paired with its course configuration by naming convention.

The pricing configuration types SHALL be declared in the shared domain package alongside `CourseConfig`, since a required field's type cannot be owned by a package that depends on the package declaring the field. Pricing *behavior* — the engine and its tax-normalization and static-resolution logic — SHALL remain outside the shared domain package; only the configuration shape moves.

The engine SHALL continue to be parameterized by a `courseId`-keyed map of pricing configurations rather than by course configurations themselves, so the engine stays independent of `CourseConfig` and remains testable against a bare pricing configuration. The composition root SHALL derive that map from the registered course configurations rather than authoring it as a second, independently-maintained list.

#### Scenario: Course config carries its pricing configuration

- **WHEN** a `CourseConfig` is defined for an in-scope course
- **THEN** it carries a `pricing` configuration of `{ tax?, rules }`
- **AND** the field is readable without knowledge of the course's booking platform

#### Scenario: A course cannot be configured without pricing

- **WHEN** a course configuration is authored without a `pricing` field
- **THEN** it fails to compile
- **AND** the omission is not deferred to a runtime failure part-way through an ingestion run

#### Scenario: Registering a course registers its pricing exactly once

- **WHEN** a course is added to the composition root's registry
- **THEN** its pricing configuration reaches the engine without a second registration step
- **AND** no list exists that could name a course the other does not

#### Scenario: Engine is parameterized by pricing configs, not course configs

- **WHEN** the pricing engine is constructed
- **THEN** it receives a `courseId`-keyed map of pricing configurations
- **AND** it can be exercised against a bare pricing configuration with no course configuration present

#### Scenario: Greenbryre is configured with a pre-tax dynamic tax rule

- **WHEN** the pricing engine enriches a Greenbryre tee time whose scraped green fee is pre-tax
- **THEN** the configured tax rule marks the scraped price as not tax-inclusive with the course's tax rate
- **AND** `pricePerPlayer` equals the scraped price grossed up by that tax rate, rounded to cents

#### Scenario: Dakota Dunes is configured with a pre-tax dynamic tax rule

- **WHEN** the pricing engine enriches a Dakota Dunes tee time whose scraped green fee is pre-tax
- **THEN** the configured tax rule marks the scraped price as not tax-inclusive with the course's `0.11` tax rate
- **AND** `pricePerPlayer` equals the scraped price grossed up by that tax rate, rounded to cents
- **AND** no static pricing rule is consulted
