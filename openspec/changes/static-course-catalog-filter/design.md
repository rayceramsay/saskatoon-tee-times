## Context

The web dashboard fetches one day's tee times and derives the Course filter's options from them via `availableCourses(teeTimes)` (`apps/web/lib/derived.util.ts`). Two places consume that derivation:

1. `dashboard.tsx` — passes the derived `CourseOption[]` to the layouts, which render `CourseFilter`'s checkbox list.
2. `apply-view.util.ts` — recomputes `availableCourses(teeTimes)` internally to feed `resolveSelectedCourseIds`, which validates URL `courses` slugs and decides the fallback-to-all behavior.

Because the derivation only surfaces courses with ≥1 time on the selected date, the filter's shape changes as the golfer navigates dates. Course identity (id + display name) already exists as the source of truth in the eight scraper course configs under `packages/scraper-core/src/platforms/*/courses/*.ts`.

## Goals / Non-Goals

**Goals:**
- Offer a stable, date-independent Course filter listing all known courses.
- Make `courses` slug resolution date-independent so a known course is a valid selection even on a day it has no times.
- Isolate the eventual swap to a `GET /courses` endpoint behind a single module.

**Non-Goals:**
- Building the `GET /courses` endpoint (explicit follow-up).
- Deriving the catalog at build time from the scraper configs, or sharing a catalog package across apps.
- Any API, scraper, or persistence change.

## Decisions

**1. A web-local static module `apps/web/lib/courses.ts` exporting `ALL_COURSES: CourseOption[]`.**
Shaped exactly like the future `GET /courses` response so the swap replaces only the module's internals (a fetch/SWR-backed source) and, at most, the dashboard wiring. Alternatives: (a) a shared `tee-time-domain` catalog — rejected because the identities live in `scraper-core`, not the domain package, and it would couple the web build to server packages for a stopgap; (b) a new shared catalog package — overkill for eight lines that will be deleted when the endpoint lands.

**2. Author the array in display order and drop the runtime `localeCompare` sort.**
The list is exactly what's written, giving explicit control over ordering. `CourseFilter` and `resolveSelectedCourseIds` no longer depend on `availableCourses`' sort.

**3. Replace both consumers with `ALL_COURSES`.**
`dashboard.tsx` passes `ALL_COURSES` to the layouts. `apply-view.util.ts` resolves selected ids against `ALL_COURSES.map(c => c.id)`. This is what makes slug resolution date-independent: a catalog course's slug always survives `resolveSelectedCourseIds`, so selecting a course with no times today yields its empty state instead of the all-courses fallback.

**4. Remove `availableCourses` (and relocate/trim its tests).**
It has no remaining callers after this change. `resolveSelectedCourseIds` keeps its existing signature (`availableIds` argument) and behavior; only its argument source changes, so its unknown-slug logic is preserved unchanged.

## Risks / Trade-offs

- **Catalog drift**: if the scraper gains a ninth course, the hardcoded list goes stale. Its tee times still render (the default "all" shows everything; `applyView` only filters *out* non-selected courses), but it gets no checkbox and can't be individually filtered. → Mitigation: keep the catalog beside a comment pointing at the scraper configs as the source; the `GET /courses` follow-up removes the drift entirely.
- **Duplicated identities**: course id + name are copied from the scraper configs. → Accepted as a temporary cost; the module is the single place to update, and the endpoint supersedes it.
- **Behavior change is intentional and user-approved**: `?courses=wildwood` on an empty day now shows Wildwood's empty state. Captured as a modified requirement/scenario in the spec.

## Migration Plan

Pure frontend change; ships with the static export. No data migration. Rollback is reverting the two call sites to `availableCourses(teeTimes)` and restoring the function.
