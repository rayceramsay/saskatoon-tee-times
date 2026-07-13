## Context

`apps/web` is a bare Next.js 16 app (`output: 'export'`, React 19) with a placeholder page and no styling system. The read API (`GET /tee-times?date=`, served under `/api/*` in prod) is live and returns `{ date, teeTimes: TeeTime[], lastUpdatedAt }`, where `TeeTime` comes from `@stt/tee-time-domain`. The UX is fully specified in this change's `ux-planning/DESIGN.md` and `ux-planning/EXPERIENCE.md`, with pixel references in `ux-planning/.working/desktop-layout-v3-2026-06-29.html` and `ux-planning/.working/mobile-layout-v2-2026-06-29.html` (this folder was relocated from `docs/` so the change is self-contained).

Constraints: static export (no SSR / no server runtime), AWS Free Tier ($0 target), system-font-only, <2s load, density-first design. The stack is prescribed (TailwindCSS v4, SWR) but not yet installed. Core principles from CLAUDE.md apply: separation of concerns, pure testable logic, test behaviours not implementation.

## Goals / Non-Goals

**Goals:**

- Implement the single-surface dashboard exactly matching the two mockups and DESIGN.md, with URL-encoded view state.
- Isolate all filtering/sorting/grouping as pure functions over `TeeTime[]`, unit-tested independent of React.
- One fetch per date via SWR; every other interaction instant and client-side.
- Two responsive layouts from one component tree, switched by CSS with no hydration flash.
- Consume the live API shape as the schema of record; introduce a typed, Zod-validated client boundary for responses and config.

**Non-Goals:**

- No API, backend, or domain changes. `GET /tee-times` is consumed unchanged.
- No infrastructure/deployment (S3, CloudFront, `/api/*` origin) — a separate IaC change.
- No SSR, ISR, or server components for data; the app is fully static and fetches on the client.
- No dark mode, no i18n, no analytics/ads (ads are a future PRD concern; layout must not preclude them).
- Moon Lake and any course not returned by the API — never hardcoded in.

## Decisions

### 1. URL query string is the single source of truth for view state

A typed `viewState` (date, holes, players, from, courses, group) is derived from `URLSearchParams` on every render. **Date changes use `history.pushState`** so the browser Back button returns to the previously viewed day; all other filter changes use `history.replaceState` to avoid flooding history per keystroke/toggle. Parsing is total: unknown/out-of-range values coerce to defaults (spec: silent fallback). Defaults are omitted from the URL so shared links stay clean.

- **Why:** EXPERIENCE.md mandates zero-routing, shareable URLs, and a single fetch boundary. URL-as-state makes share/restore free and keeps one authoritative copy.
- **Alternatives:** React state + manual URL sync (two sources of truth, drift risk); Next.js dynamic routes (overkill, fights static export). Rejected.
- **Static-export note:** `useSearchParams` requires a Suspense boundary under static export; the page wraps the client tree accordingly.

### 2. Data layer: SWR keyed by date only

`useSWR(['tee-times', date], fetcher)` with `keepPreviousData: true` so date switches keep the prior day visible under a loading treatment; last-write-wins on superseded dates is handled by SWR's key-scoping (stale responses for a non-current key are discarded). Response is validated with a Zod schema mirroring `TeeTime` at the fetch boundary (fail loud on shape drift).

- **Why:** Exactly one variable (date) drives fetching; SWR gives caching, request deduplication, race-safe key scoping, and loading/error state that map onto the design's state cards — with a minimal API and small bundle that fit a read-only static-export dashboard.
- **Alternatives:** bare `fetch` + `useEffect` (manual race handling, no cache); TanStack Query (more capable — explicit `AbortSignal` cancellation, devtools — but heavier, and its extra surface buys nothing for a single read-only query). Rejected.

### 3. Filtering / sorting / grouping are pure functions, not effects

A `applyView(teeTimes, viewState, now)` pipeline composes small pure predicates: `isPast(now)` → course membership → holes equality → players group-size membership → earliest-start → sort → optional group-by-course. Lives in a framework-free module; components call it and render.

- **Why:** These encode the subtle product rules (non-contiguous `groupSizes` membership, course-local `isPast`, max-group-size slot label) that must be unit-tested (CLAUDE.md: test behaviours, OOP/pure methods). Keeping them out of React makes them trivially testable with Vitest.
- **Alternatives:** inline filtering in components (untestable, entangled). Rejected.

### 4. Course-local time via a single timezone boundary

All "now"/"today"/`isPast` reasoning goes through one helper anchored to `America/Regina` (using `Intl.DateTimeFormat` time-zone parts — no new date library unless needed). `startInstant` already carries its offset, so comparisons are instant-vs-instant; only the *default date* and *calendar today* need the zone.

- **Why:** A visitor in another timezone must see Saskatoon's day (spec requirement). Centralizing avoids scattered `new Date()` bugs.
- **Trade-off:** hardcoding `America/Regina` conflicts with the PRD's "don't assume this timezone." Mitigation: expose it as one named constant/config value so a future multi-city product overrides it in one place, not a rewrite.

### 5. TailwindCSS v4 with design tokens in `@theme`; rem sizing, px hairlines

Install Tailwind v4, map DESIGN.md's color/spacing/radius/type tokens into `@theme` custom properties (`--color-accent: #2e6b47`, etc.) in `globals.css`. Use the default rem-based spacing/type scale so the density layout scales with user font-size; keep 1px borders (`--color-line`, `--line-2`) in px. The 768px breakpoint is Tailwind's stock `md:` (`48rem`). Accent green `#2e6b47` is authoritative everywhere (desktop mockup's charcoal is stale).

- **Why:** Stack is prescribed; v4's `@theme` maps the mockups' CSS-variable token system 1:1, so the mockups translate near-mechanically. rem for accessibility; px hairlines to avoid sub-pixel border scaling.
- **Alternatives:** CSS Modules matching the mockups verbatim (no token translation, but off-stack and no utility ergonomics); Tailwind config-file theme (v3 style — v4 prefers CSS-first `@theme`). Rejected.

### 6. Responsive via CSS visibility, not a JS media-query branch

Both layout structures render in the tree; `md:` utilities show/hide (sidebar vs. bottom bar + sheet). No `useMediaQuery` gate for the top-level layout choice.

- **Why:** Under static export the first client render has no viewport knowledge; a JS branch causes a hydration flash / layout jump. CSS-driven visibility is flash-free and SSR/SSG-safe.
- **Trade-off:** both structures ship in the DOM. Acceptable — the tree is small and rows render once (shared row data), not duplicated per breakpoint where avoidable. The bottom sheet's open/close *is* JS state (fine; it's interaction, not layout selection).

### 7. Typed, Zod-validated config boundary

API base URL comes from `NEXT_PUBLIC_API_BASE_URL`, parsed through a Zod schema keyed by env-var name with `prettifyError` (matches the existing `env-config-style` convention, client variant). Prod → `/api`; local dev → the local API's origin+port.

- **Why:** Explicit configuration over implicit defaults (CLAUDE.md); fail loud at startup if misconfigured. `NEXT_PUBLIC_` is required for client-readable env in Next.
- **Alternatives:** hardcode `/api` (breaks local dev against the separate-port local server). Rejected.

### 8. Phone-only slots render text, not a disabled button

When `onlineBookable === false`, the booking cell renders a non-interactive "Call to book" text label (ink-2/ink-3, no button chrome, no tap target) — a designed state the mockups omitted. The slot still displays fully (it is available, just not online-bookable).

- **Why:** We have no phone number to prefill, so a button would imply an action we can't perform. Text communicates "available, call the course" honestly.

### 9. Flat 7-day advance window drives date navigation bounds

The navigable date set is **today through today + 7 days**, driven by a single `MAX_ADVANCE_DAYS = 7` constant. A date is navigable if it is not past and within that window; the furthest navigable date is today + 7, where the next-date affordance is disabled. No per-course windows and no release-time gating.

- **Why:** Simplicity to start. A flat constant avoids a local course-window config, duplicated window facts, and release-time logic — a smaller surface to ship the first version of the dashboard.
- **Trade-off:** loses per-course precision. A course whose real window is shorter than 7 days will show navigable dates that return no slots for it (the day still loads; that course simply has nothing on it), and the furthest day may appear before a course has actually released it. Acceptable for launch — an empty or partial result reads as self-explanatory.
- **Future:** per-course windows remain the intended evolution when precision matters — the **union** of `bookableDates(config, now)` from `@stt/tee-time-domain` (which already encodes per-course `maxAdvanceDays`, `timeZone`, and release-time gating), sourced from a small course-window config local to `apps/web`. Deferred here to keep the first version simple and self-contained.
- **Alternatives:** per-course union window (more precise but needs a duplicated local course-window config and release-time logic — deferred, see above); new API endpoint exposing course metadata (violates "no API changes" — rejected).

## Risks / Trade-offs

- **Freshness semantics diverge from DESIGN.md** → We use `lastUpdatedAt` (max `scrapedAt`) per the live API and the user's decision; DESIGN.md's "minimum/floor" wording is explicitly superseded in the proposal. Mitigation: a code comment at the freshness computation citing this decision so a future reader doesn't "fix" it back to min.

- **`useSearchParams` + static export needs Suspense** → Missing the boundary breaks the export build. Mitigation: wrap the client tree in `<Suspense>` and verify `next build` produces static output in CI.

- **Both layouts in the DOM** (Decision 6) → slight markup overhead and a risk of duplicated interactive controls being focusable while hidden. Mitigation: hidden containers use `display:none` (removed from tab order), not just visual hiding.

- **Timezone hardcoding** (Decision 4) → conflicts with PRD extensibility intent. Mitigation: single named constant, documented as the future multi-city override point.

- **API shape drift** → if the API changes field names/shape, the client breaks. Mitigation: Zod validation at the fetch boundary fails loudly with a clear error rather than rendering `undefined`.

- **Flat window over/under-shoots real per-course windows** (Decision 9) → the 7-day constant may offer dates a shorter-window course hasn't released. Mitigation: those dates simply return no slots for that course and the day still loads; per-course precision is deferred to a future change (union of `bookableDates`).

## Open Questions

- **Skeleton row count:** fixed N vs. remembered previous count — cosmetic, decide in build.
