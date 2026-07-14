import { isPast, startLocalTime } from './course-local-time.util';
import { ALL_COURSES } from './courses';
import { resolveSelectedCourseIds } from './derived.util';
import type { ViewState } from './view-state.util';
import type { TeeTime } from './tee-time-response.schema';

/** A course's visible tee times under grouped-by-course view. */
export interface CourseGroup {
  id: string;
  name: string;
  teeTimes: TeeTime[];
}

/** The filtered, sorted, optionally grouped result the layouts render. */
export interface ViewResult {
  /** Flat chronological result (always populated; drives the count summary). */
  teeTimes: TeeTime[];
  /** Per-course groups when `group=course` is on, otherwise null. */
  groups: CourseGroup[] | null;
}

/**
 * Apply the full view pipeline to a day's tee times.
 *
 * Composes pure predicates in order — hide past → course membership → holes
 * equality → players group-size membership → earliest-start — then sorts
 * chronologically and, when grouping is on, buckets by course (empty courses
 * omitted). No side effects, so it is unit-testable without React.
 *
 * @param teeTimes - The day's fetched tee times.
 * @param viewState - The active filters and grouping.
 * @param now - The instant used to hide past slots.
 * @returns The chronological result and, when grouping, its per-course groups.
 */
export function applyView(
  teeTimes: readonly TeeTime[],
  viewState: ViewState,
  now: Date
): ViewResult {
  const catalogIds = ALL_COURSES.map((course) => course.id);
  const selectedCourseIds = resolveSelectedCourseIds(viewState.courses, catalogIds);

  const filtered = teeTimes.filter((teeTime) => {
    if (isPast(teeTime.startInstant, now)) return false;
    if (selectedCourseIds !== null && !selectedCourseIds.has(teeTime.courseId))
      return false;
    if (viewState.holes !== null && teeTime.holes !== viewState.holes) return false;
    if (
      viewState.players !== null &&
      !teeTime.groupSizes.some((size) => size === viewState.players)
    ) {
      return false;
    }
    if (startLocalTime(teeTime.startInstant) < viewState.from) return false;
    return true;
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(a.startInstant).getTime() - new Date(b.startInstant).getTime()
  );

  if (!viewState.group) return { teeTimes: sorted, groups: null };
  return { teeTimes: sorted, groups: groupByCourse(sorted) };
}

function groupByCourse(sorted: readonly TeeTime[]): CourseGroup[] {
  const order: string[] = [];
  const byId = new Map<string, CourseGroup>();
  for (const teeTime of sorted) {
    let group = byId.get(teeTime.courseId);
    if (!group) {
      group = { id: teeTime.courseId, name: teeTime.courseName, teeTimes: [] };
      byId.set(teeTime.courseId, group);
      order.push(teeTime.courseId);
    }
    group.teeTimes.push(teeTime);
  }
  return order.map((id) => byId.get(id)!);
}
