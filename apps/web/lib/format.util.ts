import { startLocalTime } from './course-local-time.util';
import { EARLIEST_START_FLOOR } from './view-state.util';

/** The split clock display for a tee time: the digits and the AM/PM suffix. */
export interface ClockParts {
  time: string;
  ampm: 'AM' | 'PM';
}

/**
 * Split a start instant into its course-local 12-hour clock parts.
 *
 * @param startInstant - The tee time's ISO 8601 start, with offset.
 * @returns The `time` digits (e.g. `8:05`) and `ampm` suffix.
 */
export function clockParts(startInstant: string): ClockParts {
  return splitClock(startLocalTime(startInstant));
}

/**
 * Format an `HH:MM` (24-hour) value as a full 12-hour label, e.g. `8:00 AM`.
 *
 * @param hoursMinutes - A 24-hour `HH:MM` value.
 * @returns The 12-hour label with AM/PM.
 */
export function format12Hour(hoursMinutes: string): string {
  const { time, ampm } = splitClock(hoursMinutes);
  return `${time} ${ampm}`;
}

function splitClock(hoursMinutes: string): ClockParts {
  const [hour, minute] = hoursMinutes.split(':').map(Number) as [number, number];
  const ampm = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return { time: `${hour12}:${String(minute).padStart(2, '0')}`, ampm };
}

/** Format a per-player price as a currency label with two decimals, e.g. `$52.00`. */
export function formatPrice(pricePerPlayer: number): string {
  return `$${pricePerPlayer.toFixed(2)}`;
}

/** The earliest-start filter label ("Any time" at the floor, else "From H:MM AM"). */
export function earliestStartLabel(from: string): string {
  return from === EARLIEST_START_FLOOR ? 'Any time' : `From ${format12Hour(from)}`;
}

function dateAtNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** Format a `YYYY-MM-DD` date as a chip label, e.g. `Mon, Jun 29`. */
export function formatDateChip(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dateAtNoon(date));
}

/** Format a `YYYY-MM-DD` date for the count summary, e.g. `Mon Jun 29`. */
export function formatDateSummary(date: string): string {
  return formatDateChip(date).replace(',', '');
}

/**
 * Describe the active course selection for the count summary line.
 *
 * @param courses - The view state's course slugs, or null for "all".
 * @param available - The day's available courses (for names and totals).
 * @returns "all courses", a single course name, or an "N of M courses" summary.
 */
export function courseSummary(
  courses: string[] | null,
  available: { id: string; name: string }[]
): string {
  if (courses === null) return 'all courses';
  const selected = available.filter((course) => courses.includes(course.id));
  if (selected.length === 0) return 'no courses';
  if (selected.length === available.length) return 'all courses';
  if (selected.length === 1) return selected[0]!.name;
  return `${selected.length} of ${available.length} courses`;
}

/** Format a calendar month + year header, e.g. `June 2026`. */
export function formatMonthYear(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}
