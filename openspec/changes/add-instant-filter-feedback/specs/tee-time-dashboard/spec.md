## MODIFIED Requirements

### Requirement: URL-encoded view state

The dashboard SHALL be a single page with no client-side routing. The complete view state SHALL be encoded in the URL query string using these parameters, each omitted when at its default: `date` (`YYYY-MM-DD`, default today), `holes` (`6|9|12|18`, default any), `players` (`1|2|3|4`, default any), `from` (`HH:MM` 24-hour, default `05:00`), `courses` (comma-separated slugs, default all), `group` (`course`, default off). Changing any view state SHALL update the URL without a navigation. The URL SHALL remain the canonical source of view state: on Back/Forward and on shared-link load the displayed controls SHALL reflect the URL exactly, and any optimistic control state SHALL reconcile to the URL-derived value once the URL update settles.

#### Scenario: Filter change writes to URL

- **WHEN** the user selects the 18-holes filter
- **THEN** the URL query string gains `holes=18` without reloading the page or changing the route

#### Scenario: Default value omitted from URL

- **WHEN** a filter is at its default value (e.g. holes = any)
- **THEN** its parameter is absent from the URL query string

#### Scenario: Back button restores prior view state

- **WHEN** the user changes the date (a history entry), then presses the browser Back button
- **THEN** the controls and results reflect the previous URL's view state, with no stale optimistic control state left over

## ADDED Requirements

### Requirement: Immediate filter-control feedback

Filter controls SHALL reflect a user's interaction in the same frame as the interaction, independent of the URL update and the results-list recompute. A control's visual state (a course checkbox's checked state, a toggle's active state, the earliest-start slider position, the group switch, and Select all / Deselect all) SHALL NOT wait for the URL to change or for the filtered/sorted/grouped results to be recomputed before updating. While the list catches up it SHALL show the pending treatment defined in the **Results-list pending treatment** requirement.

#### Scenario: Checkbox reflects click before list updates

- **WHEN** the user unchecks a course in the Course filter
- **THEN** the checkbox appears unchecked immediately, before the tee-time list finishes recomputing to hide that course's rows

#### Scenario: Toggle highlights immediately

- **WHEN** the user selects a Holes or Players value, moves the earliest-start slider, or toggles Group-by-course
- **THEN** the control's new state (highlight, slider position, switch position) is shown immediately, not after the list recompute

#### Scenario: Select all reflects immediately

- **WHEN** the user activates Select all or Deselect all on the Course filter
- **THEN** every course checkbox updates to its new state immediately, before the list recompute completes

#### Scenario: Rapid successive interactions stay consistent

- **WHEN** the user toggles several course checkboxes in quick succession
- **THEN** each toggle is applied on top of the prior optimistic state (never a stale value) and the final control state and results match the resulting URL

### Requirement: Results-list pending treatment

While the displayed results do not yet reflect the current selection, the results list SHALL show a pending treatment — a subtle dimming carrying a gentle opacity oscillation, identical for client-side filter changes and date changes — and SHALL clear it only once the fully-resolved results for the current selection (including any date fetch) are displayed. The treatment SHALL appear only after a short buffer, so a change that resolves near-instantly does not flash it. The full skeleton placeholder SHALL be shown only when no results have been loaded at all; once results have loaded, a subsequent change SHALL keep the prior results visible under the pending treatment rather than replacing them with the skeleton.

#### Scenario: Date change keeps prior results under the pending treatment

- **WHEN** the user changes the date and the new date's tee times require a network fetch
- **THEN** the prior date's results stay visible under the pending treatment for the full duration of the fetch, and are replaced by the new date's results the moment they load, at which point the treatment clears

#### Scenario: Skeleton only before any results have loaded

- **WHEN** the user changes the date after results have already loaded at least once
- **THEN** the full skeleton placeholder is not shown; only the initial load, with no results yet, shows the skeleton

#### Scenario: Pending treatment clears with the final results

- **WHEN** a filter or date change settles
- **THEN** the pending treatment clears in the same moment the fully-resolved results for the current selection appear, without exposing an intermediate un-dimmed state

#### Scenario: Near-instant change does not flash the treatment

- **WHEN** a change resolves within the short buffer (e.g. a client-side filter, or a date whose results are already cached)
- **THEN** the pending treatment is not shown
