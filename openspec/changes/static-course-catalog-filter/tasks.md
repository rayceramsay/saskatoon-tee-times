## 1. Static catalog module

- [ ] 1.1 Create `apps/web/lib/courses.ts` exporting `ALL_COURSES: CourseOption[]` with the eight canonical courses (greenbryre, dakota-dunes, the-willows, the-legends, holiday-park-executive-9, holiday-park-championship, silverwood, wildwood) in intended display order, shaped like the future `GET /courses` response, with a comment pointing at the scraper course configs as the identity source
- [ ] 1.2 Import `CourseOption` from `derived.util` (or move the type to `courses.ts` and re-export; I vote this) so the catalog and consumers share one shape

## 2. Wire consumers to the catalog

- [ ] 2.1 In `apps/web/app/dashboard.tsx`, pass `ALL_COURSES` to the layouts instead of `availableCourses(teeTimes)`; drop the now-unused derivation and its `useMemo`
- [ ] 2.2 In `apps/web/lib/apply-view.util.ts`, resolve selected course ids against `ALL_COURSES.map((c) => c.id)` instead of `availableCourses(teeTimes)`

## 3. Retire the derivation

- [ ] 3.1 Remove `availableCourses` from `apps/web/lib/derived.util.ts` once it has no callers (keep `resolveSelectedCourseIds` and `CourseOption`)
- [ ] 3.2 Update/relocate tests in `apps/web/lib/derived.util` (and `apply-view.util.test.ts`) that referenced `availableCourses`

## 4. Tests and verification

- [ ] 4.1 Add/adjust `apply-view.util.test.ts` cases: a catalog course with no times today is a honored selection (empty state), and a truly-unknown slug is still ignored / all-unknown falls back to all
- [ ] 4.2 Add a `CourseFilter` test asserting the catalog renders on a date whose results lack a course
- [ ] 4.3 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors
