# tee-time-dashboard Specification

## Purpose
Defines the public-facing dashboard that unifies every scraped Saskatoon tee time into a single page. It specifies how visitors browse, filter, and book tee times for a chosen date: URL-encoded shareable view state, a one-fetch-per-date data model with client-side filtering, course-local (America/Regina) time anchoring, and responsive mobile/desktop layouts. The goal is a fast, link-shareable view that always reflects fresh data and lets a golfer find and open a bookable slot in as few interactions as possible.

## Requirements
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

### Requirement: Shareable and restorable URLs

Loading a URL that encodes view state SHALL restore that exact state on load, with no snap-to-today when a `date` param is present. Unrecognized or out-of-range parameter values SHALL silently fall back to their defaults with no user-visible error.

#### Scenario: Encoded state restored on load

- **WHEN** the user opens a URL containing `date=2026-07-20&players=3&from=08:00&group=course`
- **THEN** the dashboard loads showing July 20, the Players filter set to 3, earliest start 8:00 AM, and grouped-by-course view

#### Scenario: Invalid parameter falls back to default

- **WHEN** the user opens a URL containing `players=9` and `courses=not-a-real-course`
- **THEN** the Players filter is treated as Any and the unknown course slug is ignored, with no error shown

### Requirement: One fetch per date

Only a change to the `date` parameter SHALL trigger a network request (`GET {apiBaseUrl}/tee-times?date=YYYY-MM-DD`). All other filter changes (course, holes, players, earliest-start, group) SHALL be applied client-side to the already-fetched day's results with no network request. When multiple date requests are in flight, only the response for the most recently requested date SHALL be applied.

#### Scenario: Non-date filter does not refetch

- **WHEN** the user changes the Holes filter while viewing a date
- **THEN** no network request is made and the visible results update instantly from the already-fetched data

#### Scenario: Superseded date response discarded

- **WHEN** the user changes the date twice quickly and the first (older) request resolves after the second
- **THEN** the first response is discarded and only the most recently requested date's data is rendered

### Requirement: Default loaded view

On load with default filters, the dashboard SHALL display all available tee times for the current date (course-local), sorted chronologically ascending, with a count summary line and the freshness indicator reflecting data age.

#### Scenario: Initial load shows today chronologically

- **WHEN** the user opens the dashboard with no query parameters
- **THEN** all of today's tee times across all courses are shown in ascending time order with a summary count

### Requirement: Course-local time anchoring

The default date, the calendar's "today" cell, and the past-slot cutoff SHALL be computed in the course-local timezone (America/Regina), not the visitor's local timezone.

#### Scenario: Visitor in another timezone sees Saskatoon today

- **WHEN** a visitor whose device clock is in a different timezone opens the dashboard while it is still the previous calendar day in their zone but the current day in America/Regina
- **THEN** the default date shown is the current day in America/Regina

### Requirement: Past tee times hidden

Tee times whose `startInstant` is earlier than the current instant SHALL be excluded from display, filtered client-side after fetch.

#### Scenario: Elapsed slot omitted

- **WHEN** the fetched results include a tee time whose start time has already passed
- **THEN** that tee time is not rendered

### Requirement: Course filter is data-driven and multi-select

The Course filter SHALL list exactly the courses present in the fetched day's results (never a hardcoded list), each independently toggleable, defaulting to all selected. A "Select all" / "Deselect all" affordance SHALL toggle every course at once. When no course is selected the view SHALL be treated as empty.

#### Scenario: Only returned courses appear

- **WHEN** the fetched results contain no tee times for a course
- **THEN** that course does not appear as a filter option

#### Scenario: Deselecting a course hides its rows

- **WHEN** the user deselects a course
- **THEN** only tee times from the remaining selected courses are shown

#### Scenario: All courses deselected shows empty state

- **WHEN** the user deselects every course
- **THEN** the empty state is shown

### Requirement: Holes filter

The Holes filter SHALL offer `Any | 6 | 9 | 12 | 18` with a single active value at a time, defaulting to Any. A selected value SHALL show only tee times whose hole count equals it.

#### Scenario: Selecting 18 holes

- **WHEN** the user selects the 18 filter
- **THEN** only 18-hole tee times are shown

### Requirement: Earliest-start filter

The earliest-start filter SHALL cover 05:00–21:00 in one-hour increments, defaulting to 05:00 ("Any time"). When set above the floor, tee times whose `startInstant` local time is before the selected time SHALL be hidden. The URL SHALL write `from=HH:MM` (24-hour) only when above the default.

#### Scenario: Earliest start hides earlier slots

- **WHEN** the user sets earliest start to 8:00 AM
- **THEN** tee times starting before 8:00 AM local are hidden and `from=08:00` is written to the URL

### Requirement: Players filter by group-size membership

The Players filter SHALL offer `Any | 1 | 2 | 3 | 4` with a single active value, defaulting to Any. When a value is selected, a tee time SHALL be shown only if its `groupSizes` array includes that value (a membership check, not a `max >= value` comparison). Any SHALL apply no player predicate.

#### Scenario: Non-contiguous group sizes respected

- **WHEN** the user selects 1 player and a tee time has `groupSizes` of `[2,3,4]`
- **THEN** that tee time is hidden even though its maximum group size exceeds 1

### Requirement: Chronological sort with optional grouping

Results SHALL be sorted chronologically ascending by default. When Group-by-course is on (`group=course`), results SHALL be grouped under per-course headers while remaining chronologically ordered within each group; a group header SHALL render only for courses with at least one visible result after filtering.

#### Scenario: Grouped view keeps chronological order within course

- **WHEN** the user turns on Group-by-course
- **THEN** results are grouped under course headers and each group's rows remain in ascending time order

#### Scenario: Empty course group omitted

- **WHEN** grouping is on and a course has no visible results after filtering
- **THEN** no header is rendered for that course

### Requirement: Tee time row content

Each rendered tee time SHALL show its start time, course name (full, never truncated), hole count, routing set name(s) (or a neutral dash when `routing` is empty), a "Up to N" slot label where N is the maximum of `groupSizes`, and the price as `$NN` (or a neutral dash when `pricePerPlayer` is null).

#### Scenario: Missing routing and price render as neutral dashes

- **WHEN** a tee time has empty `routing` and null `pricePerPlayer`
- **THEN** the routing and price render as a neutral dash rather than a blank or fallback label

#### Scenario: Slot label uses max group size

- **WHEN** a tee time has `groupSizes` of `[2,3,4]`
- **THEN** its slot label reads "Up to 4"

### Requirement: Booking action and phone-only slots

For an online-bookable slot the row SHALL render a "Book" action that opens, in a new tab (`target="_blank" rel="noopener noreferrer"`), the booking URL for the active Players value, or the URL for the maximum group size when Players is Any. For a slot with `onlineBookable: false` the row SHALL instead render a non-interactive "Call to book" text label (no button, no link, no tap target). The Book action SHALL carry an accessible label naming the time and course.

#### Scenario: Book targets selected player count

- **WHEN** the user has Players set to 2 and clicks Book on a slot whose `bookingUrls` has a "2" entry
- **THEN** a new tab opens to that group-size-specific booking URL

#### Scenario: Book targets max size when Players is Any

- **WHEN** Players is Any and the user clicks Book
- **THEN** a new tab opens to the booking URL for the slot's maximum group size

#### Scenario: Phone-only slot shows call label

- **WHEN** a slot has `onlineBookable: false`
- **THEN** the row shows a "Call to book" text label instead of a Book button, and there is no clickable booking element

### Requirement: Freshness indicator

The topbar SHALL always display a freshness indicator (dot + label) driven by `lastUpdatedAt` from the API response (the maximum `scrapedAt` across the day's results). The dot SHALL be green when data is under 20 minutes old, amber from 20 minutes to 1 hour, and red when over 1 hour, with a label reading "Updated X min ago" / "Updated X hr ago". When there are no results (no timestamp), the indicator SHALL show a neutral dash.

#### Scenario: Fresh data shows green

- **WHEN** `lastUpdatedAt` is 3 minutes ago
- **THEN** the indicator shows a green dot and "Updated 3 min ago"

#### Scenario: Very stale data shows red

- **WHEN** `lastUpdatedAt` is 90 minutes ago
- **THEN** the indicator shows a red dot and an "Updated 1 hr ago" style label while the table still renders normally

#### Scenario: No results shows dash

- **WHEN** the day has no tee times and no timestamp
- **THEN** the freshness indicator shows a neutral dash

### Requirement: Loading, empty, and error states

While a date request is in flight the listing area SHALL show skeleton placeholders and the freshness indicator SHALL show a loading treatment. When the fetch succeeds but no tee times match, the listing area SHALL show a single generic empty state (one message for both no-data and filters-too-narrow) with a "Reset filters" action that clears client-side filters while keeping the current date. When the fetch fails, the listing area SHALL show an error state with a "Try again" action and the freshness indicator SHALL show a dash.

#### Scenario: In-flight request shows skeletons

- **WHEN** a date fetch is in progress
- **THEN** skeleton placeholder rows are shown in the listing area

#### Scenario: No matches shows reset affordance

- **WHEN** the fetch succeeds but filters exclude every tee time
- **THEN** the generic empty state is shown with a "Reset filters" action that restores default filters and keeps the current date

#### Scenario: Fetch failure shows retry

- **WHEN** the date fetch fails
- **THEN** an error state with a "Try again" action is shown and the freshness indicator shows a dash

### Requirement: Responsive layouts

The dashboard SHALL present two layouts sharing one component tree, switched at a 768px breakpoint. Below 768px: a full-screen chronological list, a sticky topbar with brand and freshness, and a bottom bar with a date chip and a Filters button that opens a bottom sheet containing all filters; the Filters button SHALL show a badge counting active non-default filters. At 768px and above: a fixed 264px filter sidebar plus a scrollable listings table with a sticky count summary and column headers. The layout switch SHALL be driven by CSS so no hydration flash occurs under static export.

#### Scenario: Mobile shows bottom-sheet filters

- **WHEN** the viewport is below 768px
- **THEN** filters are reached through a Filters button that opens a bottom sheet, not a sidebar

#### Scenario: Desktop shows sidebar

- **WHEN** the viewport is 768px or wider
- **THEN** the 264px filter sidebar and listings table are shown

#### Scenario: Filter badge counts active filters

- **WHEN** two filters are set away from their defaults on mobile
- **THEN** the Filters button shows a badge reading "2"

### Requirement: Date navigation bounds by a flat advance window

Date navigation (prev/next arrows and calendar) SHALL not allow selecting past dates. The set of navigable future dates SHALL be today through today plus a flat advance limit of 7 days, where a date is navigable if it is not past and within that window. The furthest navigable date SHALL be today + 7 days, and the next-date affordance SHALL be disabled there. Past and out-of-window calendar cells SHALL be non-interactive.

#### Scenario: Date within the advance window is navigable

- **WHEN** a date is within 7 days of today and not in the past
- **THEN** that date is navigable and selectable

#### Scenario: Date beyond the advance window is not navigable

- **WHEN** a date is more than 7 days after today
- **THEN** that date is not navigable and its calendar cell is non-interactive

#### Scenario: Next disabled at the furthest window edge

- **WHEN** the selected date equals today + 7 days
- **THEN** the next-date affordance is disabled

#### Scenario: Past dates not selectable

- **WHEN** the user views the calendar
- **THEN** past-date cells are muted and cannot be selected

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
