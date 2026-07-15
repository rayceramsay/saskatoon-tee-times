import { COURSE_TIME_ZONE } from './constants';

/**
 * The current course-local calendar date as `YYYY-MM-DD`.
 *
 * Anchored to {@link COURSE_TIME_ZONE} so a visitor in another timezone still
 * defaults to Saskatoon's golf day rather than their own.
 *
 * @param now - The instant to resolve; defaults to the current time.
 * @returns The course-local date, formatted `YYYY-MM-DD`.
 */
export function todayInCourseTz(now: Date = new Date()): string {
  // `en-CA` renders `YYYY-MM-DD`
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COURSE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Whether a tee time's start has already elapsed.
 *
 * `startInstant` carries its own UTC offset, so this is a plain instant-vs-instant
 * comparison — no timezone conversion is required.
 *
 * @param startInstant - The tee time's ISO 8601 start, with offset.
 * @param now - The instant to compare against.
 * @returns True when the start is strictly before now.
 */
export function isPast(startInstant: string, now: Date): boolean {
  return new Date(startInstant).getTime() < now.getTime();
}

/**
 * The course-local wall-clock time of a start instant as `HH:MM` (24-hour).
 *
 * Read directly from the offset-carrying ISO string, so it reflects the course's
 * local clock regardless of the viewer's timezone.
 *
 * @param startInstant - The tee time's ISO 8601 start, with offset.
 * @returns The local wall-clock time, e.g. `08:05`.
 */
export function startLocalTime(startInstant: string): string {
  return startInstant.slice(11, 16);
}
