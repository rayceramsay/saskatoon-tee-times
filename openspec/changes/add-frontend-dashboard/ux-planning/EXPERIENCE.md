---
name: 'Saskatoon Tee Times'
type: experience-spine
status: final
created: '2026-06-29'
updated: '2026-06-29'
sources:
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.memlog.md'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/mobile-row-canonical-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/desktop-layout-v3-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/desktop-states-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/color-theme-forest-green-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/desktop-group-headers-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/mobile-layout-v2-2026-06-29.html'
  - 'planning-artifacts/architecture/architecture-Saskatoon Tee Times-2026-06-29/ARCHITECTURE-SPINE.md'
---

**Working files** (spines win on conflict):

- `mobile-row-canonical-2026-06-29.html` — locked 3-zone mobile row
- `mobile-layout-v2-2026-06-29.html` — mobile v2: bottom-sheet filters, date chip, slider
- `desktop-layout-v3-2026-06-29.html` — desktop sidebar + listings table layout
- `desktop-states-2026-06-29.html` — loading / empty / error / stale states
- `desktop-group-headers-2026-06-29.html` — grouped-by-course view with group header rows
- `color-theme-forest-green-2026-06-29.html` — accent-coloured elements in context

---

## Foundation

Saskatoon Tee Times is a responsive web application built with Next.js (static export, no SSR). The app serves two primary surfaces — phone in the kitchen on the way out the door, and laptop at home after work — and treats both as first-class rather than defaulting desktop to a stretched-out mobile layout.

Visual identity is defined in DESIGN.md. All component tokens referenced here as `{path.to.token}` resolve against that document.

The governing principle is **density as a core value**: maximize tee times visible per screen, minimize scrolling required to evaluate options, and deliver useful information on open with zero required clicks.

The anti-pattern to avoid is the forced sequential funnel (date → course → holes → players → then results). This app inverts that model: results appear immediately; filters are optional non-sequential refinements.

---

## Information Architecture

The application is a **single-surface, zero-routing product**. There is one page; the URL encodes the complete view state. Navigating between dates or changing filters does not change the route — it changes the URL query string and, where applicable, triggers a new data fetch.

### Surfaces

| Surface                    | Context                     | Primary job                                                                                                                  |
| -------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tee time browser (mobile)  | Phone in kitchen, on the go | Full-screen chronological list of available tee times for the selected date. Sticky topbar. Filters behind a Filters button. |
| Tee time browser (desktop) | Laptop or desktop at home   | Left sidebar (264px, fixed) acts as the query form. Right panel is a scrollable listings table.                              |

### URL state schema

All view state lives in query parameters. Omitting a parameter applies the default.

| Parameter | Values                | Default                                      |
| --------- | --------------------- | -------------------------------------------- |
| `date`    | `YYYY-MM-DD`          | Today                                        |
| `holes`   | `6`, `9`, `12`, `18`  | Any (omitted)                                |
| `players` | `1`, `2`, `3`, `4`    | Any (omitted)                                |
| `from`    | `HH:MM` (24-hour)     | `05:00` (slider floor = "Any time", omitted) |
| `courses` | comma-separated slugs | All (omitted)                                |
| `group`   | `course`              | Off (omitted)                                |

A shared URL always loads the view state it encodes. There is no snap-to-today on open if a date param is present.

### Data fetch boundary

Only the date parameter triggers a network request (`GET /api/tee-times?date=YYYY-MM-DD`). All other filters — course, holes, players, earliest-start, group-by-course — are applied client-side to the already-fetched day's results. One fetch per date change; all other interactions are instantaneous.

Past tee times (`startInstant < now`) are filtered out client-side using the shared `isPast` utility before rendering. No separate fetch is made for this.

---

## Voice and Tone

The product is direct utility. There is no brand copy, no marketing language, and no instructional scaffolding on the main surface. The interface speaks through structure and data.

Where copy is required (state cards), it is plain, short, and action-oriented:

- Empty: "No tee times found" / "There's nothing available for this date with your current filters." / "Reset filters"
- Error: "Something went wrong" / "Couldn't load tee times. Check your connection and try again." / "Try again"

One generic message covers both filter-too-narrow and no-data-for-date cases. The app does not distinguish between them.

Labels and headers use `{typography.label-caps}` (10px, weight 700, uppercase) to signal structure without adding content density.

---

## Component Patterns

| Component                  | Use                                   | Behavioral rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mobile tee time row**    | Each available slot on mobile         | Three-zone grid: `46px 1fr 58px`. LEFT: time (18px weight 700) + AM/PM (10px weight 600 `{colors.ink-3}`). MIDDLE: (1) full course name (`{typography.body-primary}`, no truncation, wraps gracefully), (2) "N holes · routing" (routing fragment omitted when unknown), (3) "up to N · $price" (price fragment omitted when unknown — no fallback label). RIGHT: Book button (min 44px height).                                                                                                                                                                                                                                                                                                                                                                                |
| **Desktop table row**      | Each available slot on desktop        | Seven-column grid: `84px 1fr 52px 118px 80px 62px 68px`. Columns: Time \| Course \| Holes \| Routing \| Slots \| Price \| Book. Time inline single line (weight 700). Course full name (weight 600, no truncation). Holes bare number. Routing set name(s) or "—" when unknown (`{colors.ink-3}`, 12px). Slots "Up to N" (`{colors.ink-2}`, 12px). Price "$NN" bold or "—" when unknown (`{colors.ink-3}`). Book button full column width.                                                                                                                                                                                                                                                                                                                                      |
| **Holes filter**           | Desktop sidebar, Holes section        | Toggle button group: `Any \| 6 \| 9 \| 12 \| 18`. 6 and 12 included for Greenbryre. Any = all hole counts. Active option uses `{colors.accent}` background + white text. Instant client-side filter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Players filter**         | Desktop sidebar, Players section      | Toggle button group: `Any \| 1 \| 2 \| 3 \| 4`. Any = slot's maxGroupSize used in booking URL. Active option uses `{colors.accent}` background + white text. Instant client-side filter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Course filter**          | Desktop sidebar, Course section       | Checkboxes for each course. Section header: "COURSE" label left, "Deselect all" / "Select all" toggle link right (flex space-between). No per-row clear link. `accent-color: {colors.accent}`. Instant client-side filter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Date navigator**         | Sidebar (desktop) and topbar (mobile) | Prev (‹) / Next (›) arrow buttons step the date one day at a time. Clicking the date string on desktop opens the calendar popup. Past dates are not navigable (arrows disabled, calendar cells muted). Furthest navigable date = max booking window across all courses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Calendar popup**         | Desktop sidebar, Date section         | `position: absolute` overlay — does not push sidebar content down. 236px wide. 7-column day grid (28px cells, `{rounded.sm}`). Today/selected = `{colors.accent}` background, white text, weight 700. Past cells = `{colors.line}` text, cursor default, hover inert. Near cells = `{colors.ink}` text. Beyond booking window = same treatment as past. Focus management: on open → move focus to today/selected cell; trap focus within popup while open; Escape closes and returns focus to the date trigger; selecting a date closes popup and returns focus to trigger. Past/beyond-window cells: `aria-disabled="true"`, removed from tab order. Today/selected cell: `aria-current="date"`. Header format: "Month YYYY" (e.g., "June 2026"); updates on month navigation. |
| **Group-by-course toggle** | Desktop sidebar, last filter section  | Toggle switch: 34–38px wide, 20–22px tall. Off = `{colors.line}` track. On = `{colors.accent}` track. Shows group-header-rows when on; reverts to flat chronological list when off. Per-course freshness indicators are only visible when this is on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Freshness indicator**    | Topbar (always visible)               | 7–9px dot + text label. Three states: fresh (`{colors.status-fresh}`, < 20 min), stale (`{colors.status-amber}`, 20 min – 1 hr), very stale (`{colors.status-red}`, > 1 hr). Text: "Updated X min ago" / "Updated X hr ago". `lastUpdated` = minimum `scrapedAt` across all results for the day (freshness floor, never overstated).                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Group header row**       | Table, when group-by-course is on     | Full-width row spanning all 7 columns. Background `{colors.bg}`, top + bottom `{colors.line}` border, ~32px height. Left: course name in `{typography.label-caps}` style (`{colors.ink-3}`). Middle: slot count (`{colors.ink-3}`). Right: per-course freshness dot + "Updated X ago" in the dot's colour. Only rendered for courses with ≥1 visible result after filtering. See [`desktop-group-headers-2026-06-29.html`](.working/desktop-group-headers-2026-06-29.html) for reference.                                                                                                                                                                                                                                                                                       |
| **Skeleton bar**           | Table body during loading             | 12px-tall grey bars (`{colors.line}`) with shimmer gradient animation. Button column uses full-height skeleton rectangle. Respects `prefers-reduced-motion` — shimmer stops, static fill only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **State card**             | Table body during empty/error         | Centered card in table area. Empty: golf icon + heading + body + "Reset filters" underline link. Error: warning icon + heading + body + "Try again" filled button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Book button**            | Every tee time row                    | Background `{colors.accent}`; white text; 12–13px weight 600; `border-radius: {rounded.md}`; min 44px height on mobile, ~30px desktop. `aria-label="Book [H:MM AM/PM] at [Course Name]"` generated from row data at render time (e.g., `aria-label="Book 8:00 AM at Holiday Park Executive 9"`). Visible label remains "Book".                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Filters button**         | Mobile bottom bar                     | Opens the filter sheet from the bottom. Badge shows count of active non-default filters (date ≠ today, from ≠ 05:00, courses ≠ all, holes ≠ any, players ≠ any, group ≠ off). Badge hidden when all filters are at default. Minimum 44×44px tap target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Date chip**              | Mobile bottom bar                     | Shows current selected date. Tapping opens filter sheet scrolled to Date section. Updates instantly when date changes in sheet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Earliest start slider**  | Desktop sidebar + Mobile filter sheet | Horizontal slider, range 05:00–21:00, 1-hour increments. Label above thumb shows "From H:MM AM" or "Any time" at 5 AM default. Client-side filter: hide slots whose startInstant is before selected time. URL writes `from=HH:MM` (24h) when not at default; omit when at default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## State Patterns

| State                | Surface | Treatment                                                                                                                                                                                                                                                                                     |
| -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Loading**          | Both    | Skeleton shimmer rows replace table body. Freshness shows "Updating…" in `{colors.ink-3}`. Count summary line is blank. Column headers remain visible.                                                                                                                                        |
| **Empty**            | Both    | Count shows "0 tee times". Table body replaced with centered state card: golf icon + "No tee times found" + "There's nothing available for this date with your current filters." + "Reset filters" underline link. One generic message for both filter-too-narrow and no-data-for-date cases. |
| **Error**            | Both    | Centered state card: warning icon + "Something went wrong" + "Couldn't load tee times. Check your connection and try again." + "Try again" filled button. Freshness indicator shows dash "—". Count summary blank.                                                                            |
| **Stale but loaded** | Both    | Table renders normally with all data visible. The red dot (`{colors.status-red}`) in the topbar freshness indicator is the only signal. No interstitial, overlay, or banner.                                                                                                                  |
| **Default (loaded)** | Both    | Full table of tee times, sorted chronologically. Count summary visible. Freshness dot reflects data age. Past tee times are hidden (client-side `isPast` filter applied).                                                                                                                     |
| **Focus**            | Both    | Visible `{colors.accent}` outline ring on all interactive elements. Sidebar tab order: Date chip/nav → Earliest start slider → Course checkboxes → Holes toggles → Players toggles → Group-by-course toggle. Listings tab order: Book buttons in visual order.                                |

---

## Interaction Primitives

**Date change:** Changes the `date` query parameter and triggers a new `GET /api/tee-times?date=YYYY-MM-DD` fetch. The table enters the loading state while the request is in flight.

**All other filter changes (course, holes, players, from, group):** Update the URL query string and instantly refilter the already-fetched dataset client-side. No network request. No loading state. Result count updates immediately.

**"Reset filters"** (empty state): Clears all client-side filters (courses, holes, players, from) from the URL, reapplying defaults. Date is unchanged — the user stays on the same day.

**Book:** Opens the course's booking portal in a new tab, with the specific slot pre-selected where the portal's URL scheme permits. Booking completion happens on the external portal; the app does not own the checkout flow.

**Sorting:** Chronological only — no column-sort affordance. The Group-by-course toggle groups results by course but each course group remains in chronological order internally.

**Calendar popup (desktop):** Opens as a `position: absolute` overlay above the sidebar date section when the date string is clicked. Clicking outside dismisses it. Prev/next month arrows navigate calendar months without changing the selected date. Escape key dismisses the popup and returns focus to the date trigger.

**Date fetch:** Only the response for the most recently requested date is applied; earlier in-flight responses for superseded dates are discarded (last-write-wins).

**Book links:** Use `target="_blank" rel="noopener noreferrer"`.

**All-courses-deselected:** Treated as empty state ("No tee times found"); Reset filters restores all courses.

**Players filter predicate:** Show slots where `groupSizes` includes `selectedPlayers` (not merely `maxGroupSize >= selectedPlayers` — a slot's bookable sizes aren't assumed contiguous, e.g. singles may be disallowed on an otherwise-open 4-capacity slot). Any = no predicate (all slots shown).

**URL fallback:** Silently apply defaults for any unrecognised or out-of-range param value (unknown course slugs ignored, out-of-range players/holes/time values reset to Any/default). No user-visible error.

**Group URL param:** A URL with `group=course` loads with the Group-by-course toggle in the On state and the table in grouped mode.

**Date navigation bounds:** Next date-nav arrow is disabled when current date equals the furthest navigable date.

**Group headers:** Only rendered for courses that have at least one visible result after filtering.

**Freshness when empty:** When result set is empty (no `scrapedAt`): show "—" (same as error state).

**Calendar header format:** "Month YYYY" (e.g., "June 2026"); updates on month navigation.

---

## Responsive & Platform

**Responsive breakpoint:** 768px. Below 768px = mobile layout (full-screen list + bottom-sheet filters). 768px and above = desktop layout (264px sidebar + listings table).

### Mobile

- Full-screen chronological list; no sidebar.
- Topbar (sticky): brand name + freshness indicator only.
- Bottom sticky bar (fixed above safe area inset): date chip (left, shows current date, tapping opens filter sheet) + Filters button with active filter badge (right).
- Filter sheet: bottom sheet sliding up from bottom. Contents in order: Date (prev/next arrows + mini calendar) → Earliest start slider → Course (checkboxes + Deselect all) → Holes (toggle group) → Players (toggle group) → Group by course (toggle). Dismiss: swipe down or tap dim overlay.
- Tee time rows use the locked 3-zone grid (`46px 1fr 58px`, 12px gap). See mobile-row-canonical working file.
- Count summary ("38 tee times today · all courses") below topbar, above rows.
- No column headers — structure is encoded in the row layout.

### Desktop

- Persistent left sidebar (264px, fixed height, `overflow: visible` so calendar popup escapes its bounds).
- Sidebar filter order (top to bottom): Date → Earliest start → Course → Holes → Players → Group by course.
- Listings panel fills remaining width; `overflow-y: auto`.
- Sticky block at top of listings panel: count summary above, column headers below.
- Count summary format: "N tee times · all courses · Mon Jun DD" (or course list when courses are filtered).
- 7-column table grid; row minimum height 42px.
- Row hover: background `{colors.panel-hover}` (slight tint of panel).

### Shared

- Both surfaces show the freshness indicator at all times.
- Both surfaces enforce chronological sort as the only sort order.
- Both surfaces apply the same URL state schema; a URL generated on mobile works on desktop and vice versa.
- Both surfaces use the same `isPast` client-side filter to hide elapsed tee times.

---

## Accessibility Floor

- **Contrast:** `{colors.accent}` (#2e6b47) on `{colors.panel}` white = 6.35:1. Meets WCAG AA for all text sizes. Full palette reviewed and confirmed.
- **Keyboard navigation:** Tab through all sidebar filter controls, date arrows, and every Book button in the listings. The calendar grid is navigable with arrow keys. No mouse-only interactions.
- **Focus rings:** Visible focus ring on all interactive elements using `{colors.accent}` as the ring colour.
- **Semantic table markup:** Desktop listings use `<table>`, `<th scope="col">`, and `<td>` so screen readers announce column headers per cell.
- **Touch targets:** Book button on mobile is minimum 44px tall and the full 58px wide of the right rail — meets WCAG 2.5.5. Mobile date-nav arrows and Filters button also minimum 44×44px.
- **Motion:** `prefers-reduced-motion` disables the skeleton shimmer animation. Toggle switch knob 150ms transition wrapped in `@media (prefers-reduced-motion: no-preference)`.
- **Book button aria-label:** Each Book button must carry `aria-label="Book [H:MM AM/PM] at [Course Name]"` generated from row data at render time (e.g., `aria-label="Book 8:00 AM at Holiday Park Executive 9"`). The visible label remains "Book".
- **aria-live region:** Wrap the count summary element in `aria-live="polite" role="status"`. On date change (API fetch), set `aria-busy="true"` on the listings container during loading; remove on completion.
- **Calendar focus management:** On open → move focus to today/selected cell. Trap focus within popup while open. Escape key closes and returns focus to the date trigger. Selecting a date closes popup and returns focus to trigger. Past/beyond-window cells: `aria-disabled="true"`, removed from tab order. Today/selected cell: `aria-current="date"`.
- **Toggle switch:** `role="switch"` + `aria-checked="true|false"` on the Group-by-course toggle. Label with `aria-label="Group by course"`.
- **Toggle button groups** (Holes, Players): wrap each group in `role="group"` with `aria-label="Holes filter"` / `aria-label="Players filter"`. Each button: `aria-pressed="true|false"` (mutually exclusive selection).
- **Skip navigation:** First focusable element on page is a visually hidden "Skip to tee times" link targeting the main listings panel (`#listings`).
- **Table caption:** `<caption class="sr-only">Tee times for [date]</caption>` or `aria-label` on the table element; update when date changes.
- **"—" placeholders:** Routing and Price "—" cells: `<span aria-label="Not available">—</span>`.
- **`lang="en"`:** Specify on the `<html>` element.

---

## Key Flows

### Flow 1 — "Rayce, phone in kitchen, Sunday morning"

**Protagonist:** Rayce, standing in his kitchen on a Sunday morning, phone in hand, deciding if there's time for a round before the day starts.

1. Opens the app on his phone.
2. Today's tee times load immediately — no date selection, no filter configuration required. The topbar shows today's date; the listing is populated.
3. Scans the chronological list. The time digit in the left rail (`{typography.display-time}`, 18px weight 700) is the dominant scan anchor — his eye moves down the time column first.
4. Spots "8:00 AM · Holiday Park Executive 9 · 9 holes · up to 4 · $22" in a row near the top of the list.
5. Taps the Book button (min 44px tap target, `{colors.accent}` background).
6. **Climax:** The course's booking portal opens in a new browser tab, with the slot pre-selected where the portal URL scheme permits. Rayce completes the booking on the course's own site.

**Failure path:** API returns an error → error state card appears ("Something went wrong"). Rayce taps "Try again". If the error persists, the card text implicitly directs him to navigate directly to the course site via any external means.

---

### Flow 2 — "Rayce shares a filtered view with a friend"

**Protagonist:** Rayce, on his laptop at home on a weeknight, planning a Saturday round with a friend who can only play 18 holes with 2 people.

1. Opens the app on desktop.
2. Clicks the Next arrow (›) in the sidebar Date section to step forward to next Saturday. A new `GET /api/tee-times?date=2026-07-04` fetch fires; the table enters the loading state briefly, then shows Saturday's results.
3. In the Holes filter, selects "18". In the Players filter, selects "2". Both changes are client-side and instant — the table narrows without a fetch.
4. Sees a handful of matching slots with 18 holes and capacity for 2.
5. Copies the URL from the browser address bar: `?date=2026-07-04&holes=18&players=2`.
6. Sends the link to his friend via message.
7. **Climax:** The friend opens the URL on their own device and sees the exact same filtered view for that Saturday — 18-hole slots for 2 players — with no setup, no explanation, and no navigation required.

**Failure path:** The friend opens the link after the Saturday date has passed → the URL's `date` param loads a past date. The table shows the empty state ("No tee times found" with the generic message). The friend adjusts the date using the date nav arrows to find a future slot.
