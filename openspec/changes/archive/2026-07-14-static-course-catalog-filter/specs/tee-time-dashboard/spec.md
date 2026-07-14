## RENAMED Requirements

- FROM: `### Requirement: Course filter is data-driven and multi-select`
- TO: `### Requirement: Course filter is a static catalog and multi-select`

## MODIFIED Requirements

### Requirement: Course filter is a static catalog and multi-select

The Course filter SHALL list a fixed catalog of all known Saskatoon courses — a static list, stable across dates and independent of the fetched day's results — each course independently toggleable, defaulting to all selected. A "Select all" / "Deselect all" affordance SHALL toggle every course at once. When no course is selected the view SHALL be treated as empty.

A `courses` slug that names a catalog course SHALL be honored regardless of whether that course has any tee times on the selected date; the resulting view shows that course's tee times, which may be empty. A `courses` slug that names no catalog course SHALL be ignored, and a selection consisting entirely of unknown slugs SHALL fall back to all courses.

#### Scenario: Catalog stable across dates

- **WHEN** the fetched results for the selected date contain no tee times for a course
- **THEN** that course still appears as a filter option

#### Scenario: Known course with no times today shows empty

- **WHEN** the user selects only a catalog course that has no tee times on the selected date (e.g. `?courses=wildwood` on a day Wildwood has no times)
- **THEN** that course's selection is honored and the empty state is shown, rather than falling back to all courses

#### Scenario: Deselecting a course hides its rows

- **WHEN** the user deselects a course
- **THEN** only tee times from the remaining selected courses are shown

#### Scenario: All courses deselected shows empty state

- **WHEN** the user deselects every course
- **THEN** the empty state is shown
