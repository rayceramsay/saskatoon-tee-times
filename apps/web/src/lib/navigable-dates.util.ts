import { MAX_ADVANCE_DAYS } from './constants';

/**
 * Add whole days to a `YYYY-MM-DD` date via UTC calendar arithmetic, avoiding
 * any host-zone or DST drift.
 *
 * @param date - The base date, `YYYY-MM-DD`.
 * @param days - Whole days to add (may be negative).
 * @returns The shifted date, `YYYY-MM-DD`.
 */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The ordered set of selectable dates: today through today + the advance window.
 *
 * @param today - The course-local date, `YYYY-MM-DD`.
 * @param maxAdvanceDays - The flat advance window; defaults to {@link MAX_ADVANCE_DAYS}.
 * @returns The navigable dates, earliest first.
 */
export function navigableDates(
  today: string,
  maxAdvanceDays: number = MAX_ADVANCE_DAYS
): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset <= maxAdvanceDays; offset++) {
    dates.push(shiftDate(today, offset));
  }
  return dates;
}

/**
 * The furthest selectable date (today + the advance window); the next-date
 * affordance is disabled here.
 *
 * @param today - The course-local date, `YYYY-MM-DD`.
 * @param maxAdvanceDays - The flat advance window; defaults to {@link MAX_ADVANCE_DAYS}.
 * @returns The furthest navigable date.
 */
export function furthestNavigableDate(
  today: string,
  maxAdvanceDays: number = MAX_ADVANCE_DAYS
): string {
  return shiftDate(today, maxAdvanceDays);
}

/**
 * Whether a date is selectable: not past and within the advance window.
 *
 * @param date - The candidate date, `YYYY-MM-DD`.
 * @param today - The course-local date, `YYYY-MM-DD`.
 * @param maxAdvanceDays - The flat advance window; defaults to {@link MAX_ADVANCE_DAYS}.
 * @returns True when `date` is navigable.
 */
export function isNavigable(
  date: string,
  today: string,
  maxAdvanceDays: number = MAX_ADVANCE_DAYS
): boolean {
  return date >= today && date <= furthestNavigableDate(today, maxAdvanceDays);
}
