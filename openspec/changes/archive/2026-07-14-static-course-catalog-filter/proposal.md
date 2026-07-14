## Why

The Course filter is derived from the fetched day's tee times, so a course disappears from the filter whenever it has no times on the selected date. The list changes shape as the golfer navigates dates, which is disorienting and makes the filter feel unreliable. A stable, known set of Saskatoon courses should always be offered.

## What Changes

- Introduce a static course catalog (`apps/web/lib/courses.ts`) exporting `ALL_COURSES: CourseOption[]` — the eight canonical Saskatoon courses (id + display name) — shaped to match the future `GET /courses` response so a later swap is isolated.
- The Course filter SHALL render this static catalog on every date instead of the courses present in the day's results. The offered courses no longer change per date.
- Course-slug resolution (`resolveSelectedCourseIds`) validates against the static catalog rather than the day's courses. **BREAKING** (behavior): a URL like `?courses=wildwood` on a date where Wildwood has no times now filters to Wildwood's empty state instead of falling back to all courses. This is the intended, more-correct behavior — the filter means what it says regardless of date.
- Truly unknown slugs (not in the catalog) are still ignored, and a selection that is entirely unknown still falls back to all courses.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `tee-time-dashboard`: The "Course filter is data-driven and multi-select" requirement changes from listing exactly the courses present in the fetched day's results ("never a hardcoded list") to listing a fixed catalog of all known courses, stable across dates. The unknown-course-slug scenario is refined so a known-but-absent-today course is a valid, honored selection.

## Impact

- `apps/web/lib/courses.ts` (new): the static `ALL_COURSES` catalog.
- `apps/web/app/dashboard.tsx`: feeds `ALL_COURSES` to the layouts/`CourseFilter` instead of `availableCourses(teeTimes)`.
- `apps/web/lib/apply-view.util.ts`: resolves selected course ids against `ALL_COURSES` instead of the day's courses.
- `apps/web/lib/derived.util.ts`: `availableCourses` loses both call sites (delete or repurpose); its tests move accordingly.
- No API, scraper, or persistence changes. Course identities are sourced (by copy) from the scraper course configs.
- Follow-up (out of scope): a `GET /courses` endpoint that replaces this hardcoded list as the catalog's source.
