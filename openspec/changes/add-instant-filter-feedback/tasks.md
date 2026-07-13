## 1. Optimistic view-state overlay

- [ ] 1.1 In `apps/web/app/dashboard.tsx`, introduce an optimistic copy of the URL-derived `viewState` using React 19 `useOptimistic`, seeded from `parseViewState(searchParams, today)`.
- [ ] 1.2 Add a reducer/patch applier that merges a `Partial<ViewState>` (and the full reset object) onto the optimistic base, preserving the `courses` null-vs-array semantics.
- [ ] 1.3 Pass the optimistic view state (not the raw URL-derived one) to the controls, while continuing to compute `applyView` and fetch keyed off the canonical/committed date.

## 2. Decouple URL write and list recompute

- [ ] 2.1 Wrap the `router.replace`/`router.push` calls in `navigate()` inside `startTransition`, applying the optimistic patch synchronously first.
- [ ] 2.2 Expose the transition's `isPending` and apply a subtle pending treatment to the listing area while it catches up (without disabling or blocking the controls).
- [ ] 2.3 Feed the results list a deferred view of the computed result (`useDeferredValue`) and/or memoize `applyView` on `(teeTimes, viewState, now)` so the list lags one commit behind the controls instead of sharing their commit.

## 3. Controls read from immediate state

- [ ] 3.1 Confirm every control in `apps/web/components/filters.tsx` (course checkboxes, Select all/Deselect all, holes, players, earliest-start slider, group switch) derives its visual state from the optimistic view state so it reflects clicks immediately.
- [ ] 3.2 Verify the Course filter `toggle` and Select-all logic apply against the optimistic base so rapid successive toggles never compute from stale state.

## 4. Verify behavior

- [ ] 4.1 Manually verify each control flips/highlights/moves in the same frame as the click, before the list finishes recomputing.
- [ ] 4.2 Verify Back/Forward and shared-link loads reconcile controls to the URL exactly (no leftover optimistic state); confirm the date `push` vs filter `replace` history behavior is unchanged.
- [ ] 4.3 Confirm no network refetch occurs on non-date filter changes and the URL parameter contract (params omitted at default) is unchanged.
- [ ] 4.4 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors.
