## 1. Optimistic view-state overlay

- [x] 1.1 In `apps/web/app/dashboard.tsx`, introduce an optimistic copy of the URL-derived `viewState` using React 19 `useOptimistic`, seeded from `parseViewState(searchParams, today)`.
- [x] 1.2 Add a reducer/patch applier that merges a `Partial<ViewState>` (and the full reset object) onto the optimistic base, preserving the `courses` null-vs-array semantics.
- [x] 1.3 Pass the optimistic view state (not the raw URL-derived one) to the controls, while continuing to compute `applyView` and fetch keyed off the canonical/committed date.

## 2. Decouple URL write and list recompute

- [x] 2.1 Wrap the `router.replace`/`router.push` calls in `navigate()` inside `startTransition`, applying the optimistic patch synchronously first.
- [x] 2.2 Expose the transition's `isPending` and apply a subtle pending treatment to the listing area while it catches up (without disabling or blocking the controls).
- [x] 2.3 Feed the results list a deferred view of the computed result (`useDeferredValue`) and/or memoize `applyView` on `(teeTimes, viewState, now)` so the list lags one commit behind the controls instead of sharing their commit.

## 3. Controls read from immediate state

- [x] 3.1 Confirm every control in `apps/web/components/filters.tsx` (course checkboxes, Select all/Deselect all, holes, players, earliest-start slider, group switch) derives its visual state from the optimistic view state so it reflects clicks immediately.
- [x] 3.2 Verify the Course filter `toggle` and Select-all logic apply against the optimistic base so rapid successive toggles never compute from stale state.

## 4. Verify behavior

- [x] 4.1 Manually verify each control flips/highlights/moves in the same frame as the click, before the list finishes recomputing.
- [x] 4.2 Verify Back/Forward and shared-link loads reconcile controls to the URL exactly (no leftover optimistic state); confirm the date `push` vs filter `replace` history behavior is unchanged.
- [x] 4.3 Confirm no network refetch occurs on non-date filter changes and the URL parameter contract (params omitted at default) is unchanged.
- [x] 4.4 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors.

## 5. Pending treatment tracks resolved results

- [x] 5.1 In `apps/web/app/dashboard.tsx`, replace `listingPending = isPending` with a busy signal that is also true while the loaded data is for a different date than the fetched one (`data.date !== viewState.date`), so a date change stays pending through its network fetch and clears only when the new date's data is in hand.
- [x] 5.2 Debounce that busy signal with a short on-delay (~150ms) and zero off-delay so near-instant/cached changes never flash the treatment and it clears immediately when settled.
- [x] 5.3 Replace the static dim in `desktop-layout.tsx` and `mobile-layout.tsx` with a subtle opacity oscillation (pulse), identical for client-side and network changes; keep the full skeleton only for the no-data-loaded (initial) state.
- [x] 5.4 Set `aria-busy` on the listing region while pending, not only during the skeleton.
- [x] 5.5 Manually verify: a date change shows a continuous pulse over the prior results until the new date lands (no early un-dim, no full-opacity stale gap); client filters pulse only when they outlast the buffer; the skeleton shows only on first load.
- [x] 5.6 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors.
