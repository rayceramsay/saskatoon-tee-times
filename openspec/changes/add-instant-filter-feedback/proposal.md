## Why

Filter controls on the dashboard feel sluggish: toggling a course, changing holes/players, moving the earliest-start slider, or picking a date visibly waits for the results list to recompute before the control itself updates (the checkbox flips, the toggle highlights, etc.). This happens because every control derives its visual state from the URL, so a click cannot show feedback until a router update round-trips and the entire tree — including the expensive result list — re-renders in one commit. The click acknowledges the *result* of the change, not the change itself, which reads as lag.

## What Changes

- Filter controls SHALL reflect a user's interaction immediately (same-frame), independent of the URL update and the results-list recompute.
- The URL SHALL remain the canonical, shareable source of truth; the immediate control state is an optimistic overlay that reconciles to the URL once it settles (and yields to it on Back/Forward and shared-link loads).
- The results-list recompute SHALL be decoupled from control feedback so the heavy filter/sort/group work no longer gates the control's visual response; the list MAY briefly show a pending treatment while it catches up.
- No change to which filters exist, their semantics, the URL parameter contract, or the one-fetch-per-date behavior.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `tee-time-dashboard`: Add a requirement that filter-control feedback is immediate and decoupled from the URL round-trip and results recompute; clarify that the existing URL-encoded view state is updated optimistically without blocking control feedback.

## Impact

- `apps/web/app/dashboard.tsx`: navigation/state wiring (introduce optimistic view-state overlay + deferred/transition-based URL update and list recompute).
- `apps/web/components/filters.tsx`: controls read from the immediate overlay rather than only the URL-derived state.
- Possibly `apps/web/lib/apply-view.util.ts` consumers: memoize / defer the result so the list lags behind controls instead of blocking them.
- No API, schema, or fetch behavior changes; no new dependencies (React 19 `useTransition` / `useOptimistic` / `useDeferredValue` already available).
