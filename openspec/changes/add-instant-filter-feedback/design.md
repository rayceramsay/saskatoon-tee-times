## Context

The dashboard (`apps/web/app/dashboard.tsx`) treats the URL query string as the single source of truth for all view state. On every render it calls `parseViewState(searchParams, today)` and passes the resulting `viewState` down to the controls (`apps/web/components/filters.tsx`). Each control's *visual* state is derived: a course checkbox's `checked`, a toggle's `active`, the slider's `value`, the date chip — all read from `viewState`, i.e. from the URL.

A filter interaction therefore takes this path:

```
click → onFilterChange(patch) → navigate() → router.replace(newUrl)
   → Next updates useSearchParams() (App Router applies this inside a React transition)
   → dashboard re-renders → parseViewState() re-derives viewState
   → ONE commit renders BOTH the control's new state AND applyView() + the full list
```

Two properties of this path cause the perceived lag:

1. **Control feedback is coupled to a router round-trip.** The control cannot repaint until the URL propagates back through `useSearchParams`. Next's App Router applies that update at transition (non-urgent) priority, so even a trivial checkbox flip is deprioritized.
2. **The cheap update and the expensive update share one commit.** The same re-render runs `applyView` (filter → sort → group over the day's tee times, `apps/web/lib/apply-view.util.ts`) and re-renders every visible row. React commits them atomically, so the control's flip is gated by the list recompute.

Stack: Next 16 (`output: 'export'`), React 19, SWR. React 19 primitives (`useTransition`, `useOptimistic`, `useDeferredValue`) are available. Fetching is keyed by date only (`useTeeTimes`), so filters never touch the network — this is purely a client render/routing latency problem.

## Goals / Non-Goals

**Goals:**
- Filter controls acknowledge a click in the same frame, independent of the URL update and the list recompute.
- Preserve the URL as the canonical, shareable, restorable source of truth (Back/Forward and shared links still work exactly as specified).
- Decouple the results-list recompute so it no longer gates control feedback; a brief pending treatment on the list is acceptable.

**Non-Goals:**
- No change to which filters exist, their semantics, the URL parameter contract, the one-fetch-per-date model, or default values.
- No list virtualization or algorithmic rework of `applyView` (out of scope; revisit only if the recompute itself proves heavy after decoupling).
- No new dependencies.

## Decisions

### Decision 1: Optimistic overlay over the URL, not URL-as-only-truth

Keep the URL canonical, but render controls from an *immediate* copy of view state that updates synchronously on interaction, then push the change to the URL in the background. React 19's `useOptimistic` models this directly: `optimisticViewState` is seeded from the URL-derived `viewState`, an interaction applies the patch to it immediately (urgent), and the URL update happens inside the same transition so `useOptimistic` knows when to reconcile back to canonical.

- **Why over a plain `useState` mirror:** a manual mirror requires an effect to re-sync on Back/Forward and shared-link loads, and is prone to drift. `useOptimistic` auto-reverts to the base value when the transition settles, so the URL stays authoritative with less reconciliation code.
- **Why not demote the URL to a debounced projection (local state canonical):** that inverts the deliberate "URL is the single source of truth" design, and forces us to re-solve Back-button semantics (esp. the date `push` vs filter `replace` distinction in `dashboard.tsx`). Bigger change, no extra benefit for the perceived-latency goal.

### Decision 2: Wrap the URL write in `startTransition`

`onFilterChange`/`onDateChange` apply the optimistic patch first, then call `router.replace`/`router.push` inside `startTransition`. This marks the URL propagation and the resulting list recompute as non-urgent, so the synchronous optimistic control update commits first. Expose `isPending` to give the list a subtle "updating" treatment without blocking the controls.

- **Alternative considered — native `history.replaceState`:** could bypass the router, but Next still drives `useSearchParams` and we'd lose the framework's history handling; `startTransition` around the existing `router` calls is smaller and keeps behavior within the framework's model.

### Decision 3: Defer the list off the control path

Feed the results list a deferred view of the computed result (`useDeferredValue`, and/or memoize `applyView` on `(teeTimes, viewState, now)`) so the list lags one commit behind the controls rather than sharing their commit. Combined with Decisions 1–2 this is what actually lets the checkbox paint before the rows re-render.

- Memoization keeps the sort/group work from re-running when unrelated state (e.g. the per-minute `now` tick) changes without affecting the filtered set.

## Risks / Trade-offs

- **Optimistic state diverging from the URL on Back/Forward** → `useOptimistic` reverts to the base (URL-derived) value once the transition completes, so canonical always wins; verify with a browser Back test after a filter change.
- **Brief inconsistency window** (controls show new state while the list still shows old) → this is the intended, and desirable, decoupling; bound it with a visible pending treatment so it reads as "loading," not "broken."
- **`courses` overlay correctness** → the course filter's null-vs-array semantics (all-selected = `null`, `toggle` collapsing to `null` at full set, `derived.util` resolution) must be applied against the optimistic value, not the URL value, or a rapid multi-toggle could compute from stale state. Apply patches to the optimistic base.
- **Over-deferring** → if the list is deferred too aggressively it can feel disconnected; keep it one commit behind, not debounced.
