---
name: 'Saskatoon Tee Times'
type: design-spine
status: final
created: '2026-06-29'
updated: '2026-06-29'
sources:
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.memlog.md'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/color-theme-forest-green-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/mobile-row-canonical-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/desktop-layout-v3-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/desktop-states-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/desktop-group-headers-2026-06-29.html'
  - 'planning-artifacts/ux-designs/ux-Saskatoon Tee Times-2026-06-29/.working/mobile-layout-v2-2026-06-29.html'
  - 'planning-artifacts/architecture/architecture-Saskatoon Tee Times-2026-06-29/ARCHITECTURE-SPINE.md'
colors:
  accent: '#2e6b47'
  accent-dark: '#245538'
  accent-light: '#eaf3ee'
  ink: '#1b1d1f'
  ink-2: '#55595e'
  ink-3: '#8a9097'
  line: '#e3e6e9'
  line-2: '#eef0f2'
  bg: '#f5f6f7'
  panel: '#ffffff'
  status-fresh: '#2e6b47' # aliases {colors.accent} — same hex, separate token for future divergence
  status-amber: '#e09400'
  status-red: '#e03030'
  status-amber-text: '#a05c00' # amber freshness label text — 5.0:1 on panel ✓ AA
  status-red-text: '#c0392b' # red freshness label text — 5.8:1 on panel ✓ AA
  panel-hover: '#f9fafb' # table row hover background
typography:
  display-time:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: '18px'
    fontWeight: 700
    letterSpacing: '-0.3px'
    lineHeight: 1
  body-primary:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: '14px'
    fontWeight: 600
    letterSpacing: '-0.1px'
    lineHeight: 1.25
  body-secondary:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: '13px'
    fontWeight: '400'
    lineHeight: 1.3
  meta:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: '12px'
    fontWeight: '400'
    lineHeight: 1.3
  label-caps:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: '10px'
    fontWeight: 700
    letterSpacing: '0.06–0.08em'
    lineHeight: 1
rounded:
  sm: '6px'
  md: '8px'
  lg: '10px'
  xl: '38px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '7': '28px'
  '8': '32px'
  '10': '40px'
components:
  book-button:
    background: '{colors.accent}'
    color: '#ffffff'
    borderRadius: '{rounded.md}'
    fontSize: '12–13px'
    fontWeight: 600
    minHeight: '44px (mobile) / 30px (desktop)'
    hover:
      background: '{colors.accent-dark}'
  toggle-button:
    border: '1px solid {colors.line}'
    background: '{colors.panel}'
    borderRadius: '{rounded.md}'
    fontSize: '12px'
    fontWeight: 500
    color: '{colors.ink-2}'
    active:
      background: '{colors.accent}'
      color: '#ffffff'
      borderColor: '{colors.accent}'
  checkbox:
    accentColor: '{colors.accent}'
    size: '14–15px'
  toggle-switch:
    width: '34–38px'
    height: '22px'
    borderRadius: 'full'
    offBackground: '{colors.line}'
    onBackground: '{colors.accent}'
    knob:
      size: '16–18px'
      background: '#ffffff'
      boxShadow: '0 1px 3px rgba(0,0,0,0.2–0.25)'
  date-picker-day:
    size: '28px'
    borderRadius: '{rounded.sm}'
    todaySelected:
      background: '{colors.accent}'
      color: '#ffffff'
      fontWeight: 700
    past:
      color: '{colors.line}'
      cursor: 'default'
    near:
      color: '{colors.ink}'
  skeleton-bar:
    background: '{colors.line}'
    shimmer: 'linear-gradient(90deg, {colors.line} 25%, {colors.line-2} 50%, {colors.line} 75%); background-size: 600px 100%; animation: shimmer 1.4s linear infinite'
    reducedMotion: 'static — no animation'
    borderRadius: '4px'
    height: '12px'
  freshness-indicator:
    dotSize: '7–9px'
    borderRadius: 'full'
    fresh:
      dotColor: '{colors.status-fresh}'
      textColor: '{colors.status-fresh}'
      threshold: '< 20 min'
    amber:
      dotColor: '{colors.status-amber}'
      textColor: '{colors.status-amber-text}'
      threshold: '20 min – 1 hr'
    red:
      dotColor: '{colors.status-red}'
      textColor: '{colors.status-red-text}'
      threshold: '> 1 hr'
  group-header-row:
    background: '{colors.bg}'
    borderTop: '1px solid {colors.line}'
    borderBottom: '1px solid {colors.line}'
    minHeight: '32px'
    courseLabel:
      fontSize: '10px'
      fontWeight: 700
      textTransform: 'uppercase'
      color: '{colors.ink-3}'
    slotCount:
      color: '{colors.ink-3}'
    freshnessText:
      color: 'matches dot color (fresh/amber/red)'
  mobile-tee-time-row:
    background: '{colors.panel}'
    border-bottom: '1px solid {colors.line-2}'
    min-height: '68px'
    grid: '46px 1fr 58px'
    padding: '12px 16px'
  state-card:
    background: '{colors.bg}'
    text-align: 'center'
    max-width: '320px'
    padding: '40px 24px'
    icon-size: '36px'
    title-size: '{typography.body-primary.fontSize}'
    title-weight: '600'
    message-color: '{colors.ink-3}'
    action-button: '{components.book-button}'
    action-link-decoration: 'underline'
    action-link-offset: '2px'
  filters-button:
    background: '{colors.bg}'
    border: '1px solid {colors.line}'
    border-radius: '{rounded.lg}'
    padding: '8px 14px'
    font-size: '13px'
    font-weight: '600'
    color: '{colors.ink}'
    badge-background: '{colors.ink}'
    badge-color: '{colors.panel}'
    badge-font-size: '10px'
    badge-font-weight: '700'
    badge-border-radius: '10px'
    min-tap-target: '44px'
  earliest-start-slider:
    track-height: '4px'
    track-background: '{colors.line-2}'
    fill-background: '{colors.accent}'
    thumb-size: '22px'
    thumb-background: '{colors.panel}'
    thumb-border: '2px solid {colors.accent}'
    label-font-size: '13px'
    label-font-weight: '600'
    range: '5:00–21:00'
    step: '1 hour'
    default: '05:00 (any time — param omitted from URL)'
  date-chip:
    background: '{colors.bg}'
    border: '1px solid {colors.line}'
    border-radius: '{rounded.lg}'
    padding: '8px 12px'
    font-size: '14px'
    font-weight: '600'
---

## Brand & Style

Saskatoon Tee Times uses a clean neutral grey system with a single forest green accent. The palette is intentionally minimal: one CSS variable (`--accent: #2e6b47`) controls every brand-coloured element. Swapping that hex rethemes the entire product.

The visual register is to-the-point utility — no decorative illustration, no gradients on surfaces, no hero imagery. The aesthetic follows consumer golf-booking apps in its clarity but avoids the over-engineered marketing tone of tee-time aggregators. White cards on a light grey background, system fonts, and green pops on interactive states are the complete vocabulary.

No web fonts are loaded. The system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) renders crisply on both macOS/iOS and Windows/Android without a network round-trip, which supports the <2s load target.

Density is a core value. Every spacing and type decision is made in service of fitting as many tee times as possible on screen while remaining scannable.

---

## Colors

### Accent family

`{colors.accent}` (`#2e6b47`) is forest green — the single brand colour. It is applied to:

- Book button background (primary CTA)
- Calendar selected/today date cell background
- Active state of Holes and Players toggle button groups
- `accent-color` on course checkboxes
- Group-by-course toggle switch track when on
- Freshness dot and text in the "fresh" state (< 20 min old)

`{colors.accent-dark}` (`#245538`) is the hover and pressed state for all accent-coloured interactive elements. It is never used as a resting background.

`{colors.accent-light}` (`#eaf3ee`) is a very pale green tint used as the inactive toggle-switch track fill and as a checkbox background wash. It recedes — accent-light is a supporting tint, not a surface colour.

Contrast ratio of `{colors.accent}` on `{colors.panel}` white = **6.35:1**, which meets WCAG AA for all text sizes. Confirmed.

### Neutral ink scale

`{colors.ink}` (`#1b1d1f`) is primary text: course names, time digits, price values, and interactive labels.

`{colors.ink-2}` (`#55595e`) is secondary text: table cell values (holes number, slots), filter labels, routing values on mobile, date navigation arrows.

`{colors.ink-3}` (`#8a9097`) is **decorative only** — used for borders, dividers, and non-informational ornament (routing dash "—", slot count in group headers, column header structural labels). Contrast ratio 3.22:1 on `{colors.panel}` — does not meet WCAG AA for any text size. Never use `ink-3` for readable text of any size; use `{colors.ink-2}` for tertiary text.

### Surface and border scale

`{colors.line}` (`#e3e6e9`) is the primary border/divider colour used for panel outlines, table column borders, and button group borders.

`{colors.line-2}` (`#eef0f2`) is a subtler divider used for row separators within the table, where a lighter line reduces visual noise between closely spaced rows.

`{colors.bg}` (`#f5f6f7`) is the page/app background: the outer shell behind sidebar and table, and the group-header-row background in grouped view.

`{colors.panel}` (`#ffffff`) is the card and table-row surface colour — sidebar, topbar, listing rows.

`{colors.panel-hover}` (`#f9fafb`) is the table row hover tint — a near-imperceptible lift from panel white applied on desktop table row hover.

### Status colours

`{colors.status-fresh}` (`#2e6b47`) — same value as `{colors.accent}`. A green freshness dot and matching text colour when data is less than 20 minutes old.

`{colors.status-amber}` (`#e09400`) — amber freshness dot fill (non-text UI element). Used only for the dot indicator, not for text labels.

`{colors.status-amber-text}` (`#a05c00`) — text-colour pairing for the amber freshness label. 5.0:1 contrast on `{colors.panel}` — meets WCAG AA.

`{colors.status-red}` (`#e03030`) — red freshness dot fill (non-text UI element). Used only for the dot indicator, not for text labels.

`{colors.status-red-text}` (`#c0392b`) — text-colour pairing for the red freshness label. 5.8:1 contrast on `{colors.panel}` — meets WCAG AA. The "stale but loaded" state shows only the red dot in the topbar — no interstitial overlay.

---

## Typography

One font family: the system stack. No role requires a custom or web font.

**`display-time`** — 18px on mobile, 14–16px on desktop; weight 700; letter-spacing −0.3px; line-height 1. Applied to the tee time start clock in the left rail of every row. This is the dominant scan anchor — the largest, boldest element in each row.

**`body-primary`** — 14px; weight 600; letter-spacing −0.1px; line-height 1.25. Applied to course names. Full course names must never be truncated with an ellipsis. They wrap gracefully at this weight and size on the widths provided by the mobile middle zone and desktop course column.

**`body-secondary`** — 13px; weight 400–500; line-height 1.3. Applied to table cells (holes number, slots, price when present) and filter labels. Desktop sidebar filter labels use 13px/ink-2.

**`meta`** — 12px; weight 400–600; line-height 1.3. Applied to: row line-2 content (holes · routing on mobile), row line-3 content (up to N · price on mobile), routing and slots columns in the desktop table, the AM/PM suffix, the count summary line, the freshness label.

**`label-caps`** — 10px; weight 700; letter-spacing 0.06–0.08em; uppercase. Applied to column headers in the desktop table (`TH` elements) and sidebar section labels (`DATE`, `COURSE`, `HOLES`, `PLAYERS`, etc.), and the course name in group-header-rows. This is the lowest visual weight in the hierarchy — it labels without competing.

---

## Layout & Spacing

Base unit: 4px. All spacing is a multiple of this unit.

Common values in use:

| Token         | Value | Usage                                             |
| ------------- | ----- | ------------------------------------------------- |
| `{spacing.1}` | 4px   | Icon/dot gap                                      |
| `{spacing.2}` | 8px   | Label margin-bottom, checkbox row gap             |
| `{spacing.3}` | 12px  | Row horizontal padding (mobile), topbar gaps      |
| `{spacing.4}` | 16px  | Sidebar horizontal padding, table cell padding    |
| `{spacing.5}` | 20px  | Sidebar section margin-bottom                     |
| `{spacing.6}` | 24px  | Section card padding                              |
| `{spacing.7}` | 28px  | Topbar left/right padding, phone mock top padding |

**Mobile row grid:** Three columns — `46px 1fr 58px` — with a 12px column gap. Left rail is the time column (fixed 46px holds up to 5-digit "10:05"). Middle zone is fluid (takes all remaining width). Right rail is the Book button (fixed 58px minimum tap width, 44px minimum tap height).

**Desktop sidebar width:** 264px. This was specifically chosen so the Holes toggle group (`Any | 6 | 9 | 12 | 18`) fits on a single line without wrapping.

**Desktop table column grid:** `84px 1fr 52px 118px 80px 62px 68px` for Time | Course | Holes | Routing | Slots | Price | Book.

**Sticky zones:**

- Mobile: topbar (brand + freshness + date nav + Filters button) is `position: sticky; top: 0`.
- Desktop: count summary + column headers together form the sticky block at top of the listings panel.

---

## Elevation & Depth

Two levels only:

**Level 0 — flat:** Page background (`{colors.bg}`). No shadow.

**Level 1 — panel:** Sidebar, topbar, table rows, state cards (`{colors.panel}` / white). No shadow on table rows. Mobile phone mock frame uses an illustrative `box-shadow: 0 18px 40px rgba(0,0,0,0.18)` for the mockup presentation only — not a production surface shadow.

**Calendar popup:** `box-shadow: 0 8px 28px rgba(0,0,0,0.14)`. This is the only production shadow in the system — used on the absolute-positioned calendar overlay in the desktop sidebar.

---

## Shapes

`{rounded.sm}` (6px) — calendar day cells, skeleton bar corners.

`{rounded.md}` (8px) — Book button (desktop), toggle filter buttons, state action buttons, Book button in desktop table.

`{rounded.lg}` (10px) — mobile date nudge buttons, mobile filter button, mobile Book button, calendar popup border-radius.

`{rounded.xl}` (38px) — phone frame mock only. Not a production surface radius.

Toggle switch track uses `border-radius: full` (half of height — 11px for a 22px tall track).

Toggle switch knob uses `border-radius: 50%`.

---

## Components

### Book button

The primary CTA on every tee time row. Background `{colors.accent}`; white text; font 12–13px weight 600; `border-radius: {rounded.md}`; minimum height 44px on mobile (tap target requirement), ~30px on desktop (density). Hover/pressed state uses `{colors.accent-dark}`. Full width of the right column on mobile; full width of the Book column on desktop.

### Toggle button (holes / players filter)

Used for the Holes (`Any | 6 | 9 | 12 | 18`) and Players (`Any | 1 | 2 | 3 | 4`) filter groups in the desktop sidebar. Resting state: `border: 1px solid {colors.line}`; background `{colors.panel}`; font 12px weight 500; color `{colors.ink-2}`; `border-radius: {rounded.md}`. Active state (selected value): background `{colors.accent}`; color white; `border-color: {colors.accent}`. Only one button in each group is active at a time.

### Checkbox (course filter)

Standard HTML checkbox. `accent-color: {colors.accent}` so the browser-rendered checkmark uses forest green. Size 14–15px. Label text 12px `{colors.ink-2}`. The Course section header uses flex `justify-content: space-between` to place the section label left and the "Deselect all" / "Select all" toggle link right — no inline clear link per checkbox row.

### Toggle switch (group-by-course)

34–38px wide, 22px tall. Track: `border-radius: full`. Off state: track fill `{colors.line}`, knob at left position. On state: track fill `{colors.accent}`, knob at right position. Knob: white circle, `box-shadow: 0 1px 3px rgba(0,0,0,0.2–0.25)`. Knob transitions position over 150ms.

### Date picker day

Calendar grid uses 28px × 28px cells. `border-radius: {rounded.sm}`. States:

- **Today / selected:** background `{colors.accent}`; color white; weight 700.
- **Past (before today):** color `{colors.line}`; `cursor: default`; hover does nothing. Non-navigable — calendar enforces today as the earliest date.
- **Near (today + 1 to booking window limit):** color `{colors.ink}`.
- **Beyond booking window:** treated as past — muted and non-interactive.

### Skeleton bar

Used to fill table cells during the loading state. Background `{colors.line}`; `border-radius: 4px`; height 12px (content bar) or the full cell height (button cell). Shimmer animation: `linear-gradient(90deg, {colors.line} 25%, {colors.line-2} 50%, {colors.line} 75%)` scrolled left-to-right at 600px over 1.4 seconds, linear, infinite. When `prefers-reduced-motion` is set, the animation stops — the bar renders as a static grey fill with no movement.

### Freshness indicator

A filled circle (7–9px, `border-radius: full`) paired with a text label. Three colour states keyed by age of `lastUpdated` (minimum `scrapedAt` across the day's results):

| State      | Threshold     | Dot colour              | Text colour                  |
| ---------- | ------------- | ----------------------- | ---------------------------- |
| Fresh      | < 20 min      | `{colors.status-fresh}` | `{colors.status-fresh}`      |
| Stale      | 20 min – 1 hr | `{colors.status-amber}` | `{colors.status-amber-text}` |
| Very stale | > 1 hr        | `{colors.status-red}`   | `{colors.status-red-text}`   |

Text format: "Updated X min ago" / "Updated X hr ago". During loading: "Updating…" in `{colors.ink-3}`. During error: dash "—".

### Group header row

Visible only when Group-by-course toggle is on. Full-width row spanning all 7 table columns. Background `{colors.bg}`; `border-top: 1px solid {colors.line}`; `border-bottom: 1px solid {colors.line}`; minimum height ~32px. Three zones:

- **Left:** Course name in `{typography.label-caps}` style (10px, weight 700, uppercase), color `{colors.ink-3}`.
- **Middle:** Slot count, `{colors.ink-3}`.
- **Right:** Freshness dot + "Updated X ago" text in the dot's status colour (green/amber/red). This per-course freshness indicator is only shown inside group headers — it does not appear in the default chronological view.

Group headers are only rendered for courses that have at least one visible result after filtering.

### Mobile tee time row

The canonical three-zone layout for each available tee time slot on the mobile listing. Grid: `46px 1fr 58px` with a 12px gap. Padding: 12px 16px. Minimum height: 68px. Background `{colors.panel}`; `border-bottom: 1px solid {colors.line-2}`.

- **LEFT (46px):** Start time in `{typography.display-time}` (18px, weight 700, letter-spacing −0.3px). AM/PM suffix directly below in `{typography.label-caps}` style (10px, weight 600, `{colors.ink-3}`).
- **MIDDLE (fluid):** Three stacked lines — (1) full course name (`{typography.body-primary}`, 14px weight 600; wraps gracefully, never ellipsis); (2) "N holes · routing" (`{typography.meta}`, 12px `{colors.ink-2}`; routing fragment omitted if unknown); (3) "up to N · $price" (`{typography.meta}`, 12px; price fragment omitted if unknown — no fallback label).
- **RIGHT (58px):** Book button filling the full 58px width, minimum 44px height.

Canonical reference: `.working/mobile-row-canonical-2026-06-29.html`.

### State card

Centred card displayed in the table body area during empty and error states. Background `{colors.bg}`; `text-align: center`; `max-width: 320px`; `padding: 40px 24px`.

- **Icon:** 36px size, centered above title.
- **Title:** `{typography.body-primary}` size (14px), weight 600, `{colors.ink}`.
- **Message:** 13px, `{colors.ink-3}`, line-height 1.5.
- **Empty state action:** "Reset filters" rendered as an underline link (`text-decoration: underline`, `text-underline-offset: 2px`), `{colors.ink-2}`.
- **Error state action:** "Try again" rendered as a filled button using `{components.book-button}` token values.

One generic card message covers both filter-too-narrow and no-data-for-date cases.

### Filters button (mobile bottom bar)

Utility button on the mobile bottom sticky bar that opens the filter sheet. Background `{colors.bg}`; border `1px solid {colors.line}`; `border-radius: {rounded.lg}`; padding `8px 14px`; font 13px weight 600; color `{colors.ink}`. Minimum tap target: 44px.

Active filter badge: small pill with `{colors.ink}` background, `{colors.panel}` text (white), 10px weight 700, `border-radius: 10px`. Badge shows when at least one filter is non-default; hidden when all filters are at their default values.

Note: `{colors.accent}` is reserved exclusively for the Book button (primary CTA). The Filters button is a utility/navigation element and uses neutral gray to recede visually.

### Earliest start slider

Horizontal range slider available in both the Desktop sidebar (section 2, below Date) and the Mobile filter sheet (below Date). Range: 5:00–21:00 (16 stops, 1-hour increments). Track height: 4px; track background `{colors.line-2}`; filled portion background `{colors.accent}`. Thumb: 22px circle, `{colors.panel}` background, `2px solid {colors.accent}` border.

Label above the thumb shows current selection: "From H:MM AM/PM" (e.g., "From 8:00 AM"). At the default position (5 AM), label reads "Any time". At default (leftmost position), the `from` parameter is omitted from the URL entirely; at any other position, writes `from=HH:MM` (24-hour format).

---

## Do's and Don'ts

| Do                                                                                                    | Don't                                                                        |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Use `{colors.accent}` for the Book button, active toggle states, and calendar selection               | Use accent on decorative elements or as a background for text-heavy surfaces |
| Use `{colors.accent-dark}` only on hover/pressed accent elements                                      | Use accent-dark as a resting state                                           |
| Show full course names — wrap gracefully, never ellipsis                                              | Truncate course names with `text-overflow: ellipsis`                         |
| Treat "Holiday Park Championship" and "Holiday Park Executive 9" as fully distinct course names       | Abbreviate or split course names into base + qualifier                       |
| Show routing only when known; fall back to "—" (desktop) or omit the routing fragment (mobile line 2) | Show "routing n/a" or any other fallback label                               |
| Show price only when known; omit the "·$price" fragment on mobile if unknown                          | Show "price n/a" or a placeholder                                            |
| Use `prefers-reduced-motion` to disable shimmer on skeleton bars                                      | Animate skeleton bars for users who have requested reduced motion            |
| Apply visible focus rings using `{colors.accent}` on all interactive elements                         | Remove focus outlines                                                        |
| Keep the freshness dot as the only stale-data signal; render the table normally                       | Show a stale-data interstitial, banner, or overlay                           |
| Use `{colors.bg}` (#f5f6f7) for the group-header-row background so it recedes from panel rows         | Use panel white for group headers                                            |
| Enforce 44px minimum touch target on the mobile Book button                                           | Shrink the mobile Book button below 44px to save space                       |
| Change the palette by swapping `--accent` only                                                        | Hard-code accent hex in component-level CSS                                  |
| Use `{colors.accent}` only on the Book button and active filter states                                | Use accent on navigation/utility controls like the Filters button            |
