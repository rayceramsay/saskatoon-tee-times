## ADDED Requirements

### Requirement: Course booking-window configuration

The universal `CourseConfig` SHALL carry the course's booking window: `maxAdvanceDays` (the number of days ahead, beyond today, that are bookable) and `releaseTime` (the local `HH:MM` time of day at which the furthest-out date becomes bookable). These fields are platform-independent booking facts and SHALL be populated for every course. Greenbryre's configuration SHALL be updated to declare its booking window.

#### Scenario: Course config declares its booking window

- **WHEN** a `CourseConfig` is defined for an in-scope course
- **THEN** it carries a `maxAdvanceDays` non-negative integer and a `releaseTime` local `HH:MM` string
- **AND** these fields are readable without knowledge of the course's booking platform

#### Scenario: Greenbryre declares a concrete booking window

- **WHEN** the Greenbryre course configuration is loaded
- **THEN** it exposes `maxAdvanceDays` and `releaseTime` values reflecting Greenbryre's booking policy
