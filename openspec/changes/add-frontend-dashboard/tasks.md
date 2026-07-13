## 1. Tooling & foundation

- [x] 1.1 Add dependencies to `apps/web`: `tailwindcss` (v4) + PostCSS wiring, `swr`, `zod`
- [x] 1.2 Configure Tailwind v4 and replace `globals.css` reset with the `@theme` token block mapping DESIGN.md colors, spacing, radius, and type tokens (accent `#2e6b47`, ink/line/bg scale, rem sizing, px hairlines)
- [x] 1.3 Add Zod-validated client config reading `NEXT_PUBLIC_API_BASE_URL` (env-config-style, `prettifyError`); add `.env.example`
- [x] 1.4 Add a `<Suspense>` boundary around the client tree so `useSearchParams` works under static export (SWR needs no provider; add an `SWRConfig` only if a shared fetcher/config is warranted)
- [x] 1.5 Add the `America/Regina` timezone constant with a documented "future multi-city override point" note
- [x] 1.6 Add a `MAX_ADVANCE_DAYS = 7` constant with a comment noting it as the flat advance window (per-course windows deferred to a future change)

## 2. Data layer

- [x] 2.1 Define the response Zod schema mirroring `TeeTime` from `@stt/tee-time-domain` plus `{ date, teeTimes, lastUpdatedAt }`; export inferred types
- [x] 2.2 Implement `fetchTeeTimes(date)` against `{apiBaseUrl}/tee-times?date=`, validating the response (fail loud on shape drift)
- [x] 2.3 Implement `useTeeTimes(date)` via `useSWR(['tee-times', date], fetcher, { keepPreviousData: true })`

## 3. Pure view logic (framework-free, unit-tested)

- [x] 3.1 Implement course-local time helpers: `todayInCourseTz()`, `isPast(startInstant, now)`
- [x] 3.2 Implement URL view-state parse/serialize: total parsing with silent fallback for invalid/out-of-range values; omit defaults on serialize
- [x] 3.3 Implement the `applyView(teeTimes, viewState, now)` pipeline: isPast → course membership → holes equality → players group-size membership → earliest-start → chronological sort → optional group-by-course
- [x] 3.4 Implement derived helpers: available course list from results, `slotMaxGroupSize`, `bestBookingUrl(slot, players)`, freshness state from `lastUpdatedAt` (green <20m / amber <60m / red else / dash when null), active-filter count
- [x] 3.5 Compute the navigable date set as today through today + `MAX_ADVANCE_DAYS` (excluding past); derive the furthest navigable date for the next-arrow bound

## 4. Shared presentational components

- [x] 4.1 `TeeTimeRow` content primitives: time, full course name (no truncation), holes, routing-or-dash, "Up to N" slots, `$NN`-or-dash price
- [x] 4.2 Booking cell: Book button (new tab, `rel="noopener noreferrer"`, aria-label with time + course) for online-bookable; "Call to book" text label when `onlineBookable === false`
- [x] 4.3 Freshness indicator (dot + label, three states + dash)
- [x] 4.4 State views: loading skeletons, generic empty state with "Reset filters", error state with "Try again"
- [x] 4.5 Filter controls: course checkboxes with select/deselect-all, holes toggle group, players toggle group, earliest-start control, group-by-course switch, date navigator + calendar popup enforcing past + flat 7-day advance-window bounds (from task 3.5); date changes `pushState`, other filters `replaceState`

## 5. Desktop layout (≥ md)

- [x] 5.1 264px sidebar assembling the filter controls in DESIGN.md order
- [x] 5.2 Listings table: 7-column grid, sticky count summary + column headers, chronological rows
- [x] 5.3 Grouped mode: per-course header rows (only for courses with visible results)

## 6. Mobile layout (< md)

- [x] 6.1 Sticky topbar (brand + freshness), full-screen 3-zone row list, count line
- [x] 6.2 Bottom bar: date chip + Filters button with active-filter badge
- [x] 6.3 Bottom-sheet containing all filters (overlay + dismiss)

## 7. Page assembly & state wiring

- [x] 7.1 Compose the single page: derive viewState from URL, fetch by date, run `applyView`, render both layouts switched by CSS `md:` visibility (`display:none` on hidden containers so they leave the tab order)
- [x] 7.2 Wire mutations: date change updates `date` param (triggers refetch); all other filters `replaceState` and re-run `applyView` with no refetch
- [x] 7.3 Wire "Reset filters" (clear client filters, keep date) and all-courses-deselected → empty state
- [x] 7.4 Set page `<title>`/metadata

## 8. Tests

- [x] 8.1 Unit-test `applyView` predicates: past hiding, course membership, holes, non-contiguous players membership, earliest-start, sort, grouping (empty groups omitted)
- [x] 8.2 Unit-test URL parse/serialize round-trip incl. invalid-value fallback and default omission
- [x] 8.3 Unit-test freshness state thresholds and `bestBookingUrl` selection (selected players vs. max when Any)
- [x] 8.4 Unit-test course-local `todayInCourseTz`/`isPast` across a timezone offset
- [x] 8.5 Unit-test the navigable date set: today through today + 7 selectable, past excluded, dates beyond +7 excluded, and the furthest-date bound at today + 7

## 9. Quality gates

- [x] 9.1 Run `pnpm format`, `pnpm check-types`, `pnpm lint`; fix all errors
- [x] 9.2 Confirm `next build` (`output: 'export'`) produces static output with no `useSearchParams`/Suspense errors
- [x] 9.3 Verify end-to-end against the local API: default load, filter interactions (no refetch), date change (refetch), phone-only slot, empty/error states, and both breakpoints
