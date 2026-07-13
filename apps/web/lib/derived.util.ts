import { EARLIEST_START_FLOOR, type ViewState } from './view-state.util';
import type { GroupSize, TeeTime } from './tee-time-response.schema';

/** A course as offered by the data-driven Course filter. */
export interface CourseOption {
  id: string;
  name: string;
}

/**
 * The distinct courses present in a day's results, sorted by name.
 *
 * @param teeTimes - The day's fetched tee times.
 * @returns Unique courses, ordered by display name.
 */
export function availableCourses(teeTimes: readonly TeeTime[]): CourseOption[] {
  const byId = new Map<string, string>();
  for (const teeTime of teeTimes) {
    if (!byId.has(teeTime.courseId)) byId.set(teeTime.courseId, teeTime.courseName);
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve the selected course set for filtering against the day's real courses.
 *
 * Null (param absent) means "all". Unknown slugs are dropped; if a non-empty
 * selection was entirely unknown it falls back to "all" (a malformed link reads
 * as no filter). A deliberately empty selection is preserved so that deselecting
 * every course yields the empty state.
 *
 * @param courses - The view state's raw course slugs, or null for "all".
 * @param availableIds - The course ids present in the day's results.
 * @returns The resolved id set, or null for "all courses".
 */
export function resolveSelectedCourseIds(
  courses: string[] | null,
  availableIds: readonly string[]
): Set<string> | null {
  if (courses === null) return null;
  const available = new Set(availableIds);
  const valid = courses.filter((id) => available.has(id));
  if (courses.length > 0 && valid.length === 0) return null;
  return new Set(valid);
}

/**
 * The largest bookable party size for a slot, used for its "Up to N" label.
 *
 * @param teeTime - The slot to measure.
 * @returns The maximum of `groupSizes`.
 */
export function slotMaxGroupSize(teeTime: TeeTime): number {
  return Math.max(...teeTime.groupSizes);
}

/**
 * A stable, unique React key for a tee time.
 *
 * A course can offer several distinct slots at the same start instant (differing
 * holes or routing), so the key includes those fields — mirroring the store's
 * composite sort key.
 *
 * @param teeTime - The slot to key.
 * @returns A key unique within a day's results.
 */
export function teeTimeKey(teeTime: TeeTime): string {
  return `${teeTime.courseId}#${teeTime.startInstant}#${teeTime.holes}#${teeTime.routing.join('+')}`;
}

/**
 * The booking URL to open for a slot given the active Players value.
 *
 * Targets the selected party size, falling back to the slot's maximum size when
 * Players is Any or the selected size has no dedicated URL.
 *
 * @param slot - The slot to book.
 * @param players - The active Players value, or null for Any.
 * @returns The best matching booking URL, or undefined when the slot has none.
 */
export function bookingUrlFor(
  slot: TeeTime,
  players: number | null
): string | undefined {
  const maxSize = slotMaxGroupSize(slot) as GroupSize;
  const size = (players ?? maxSize) as GroupSize;
  return slot.bookingUrls[size] ?? slot.bookingUrls[maxSize];
}

/** Freshness age buckets keyed off `lastUpdatedAt`. */
export type FreshnessLevel = 'fresh' | 'amber' | 'red' | 'none';

/** A freshness dot colour bucket plus its display label. */
export interface FreshnessState {
  level: FreshnessLevel;
  label: string;
}

/**
 * Freshness state derived from the response's `lastUpdatedAt` (max `scrapedAt`).
 *
 * @param lastUpdatedAt - The response's `lastUpdatedAt`, or null when the day has no results.
 * @param now - The instant to measure age against.
 * @returns The dot colour bucket and label ("—" when there is no timestamp).
 */
export function freshnessState(
  lastUpdatedAt: string | null,
  now: Date
): FreshnessState {
  if (lastUpdatedAt === null) return { level: 'none', label: '—' };

  const ageMs = Math.max(0, now.getTime() - new Date(lastUpdatedAt).getTime());
  const minutes = Math.floor(ageMs / 60_000);

  const level: FreshnessLevel = minutes < 20 ? 'fresh' : minutes < 60 ? 'amber' : 'red';
  const label =
    minutes < 60
      ? `Updated ${minutes} min ago`
      : `Updated ${Math.floor(minutes / 60)} hr ago`;

  return { level, label };
}

/**
 * The number of filters set away from their defaults (drives the mobile badge).
 *
 * @param viewState - The current view state.
 * @param today - The course-local date; a matching `date` counts as default.
 * @returns The count of non-default filters.
 */
export function activeFilterCount(viewState: ViewState, today: string): number {
  let count = 0;
  if (viewState.date !== today) count++;
  if (viewState.from !== EARLIEST_START_FLOOR) count++;
  if (viewState.courses !== null) count++;
  if (viewState.holes !== null) count++;
  if (viewState.players !== null) count++;
  if (viewState.group) count++;
  return count;
}
