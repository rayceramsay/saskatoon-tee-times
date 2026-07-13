import type { CourseConfig } from './course-config.base.js';

/**
 * Expand a course's booking window into the ordered local dates to scrape.
 *
 * The list starts at the course's current local date and extends through
 * `maxAdvanceDays` days ahead. The furthest-out date is withheld until the
 * course's local time reaches `releaseTime`; before then it is excluded, since
 * that date is not yet bookable. All reasoning happens in the course's
 * configured `timeZone` — never UTC or the host zone — so courses in other
 * zones (including future DST ones) expand correctly.
 *
 * @param config - Course config carrying `timeZone`, `maxAdvanceDays`, and `releaseTime`.
 * @param now - The instant to compute the window relative to.
 * @returns Ordered `YYYY-MM-DD` local dates to scrape, earliest first.
 *
 * @example
 * ```typescript
 * const dates = bookableDates(greenbryreConfig, new Date());
 * ```
 */
export function bookableDates(config: CourseConfig, now: Date): string[] {
  const { date: today, time: localTime } = localDateAndTime(now, config.timeZone);
  const releaseReached = localTime >= config.releaseTime;
  const furthestOffset = releaseReached
    ? config.maxAdvanceDays
    : config.maxAdvanceDays - 1;

  const dates: string[] = [];
  for (let offset = 0; offset <= furthestOffset; offset++) {
    dates.push(addDays(today, offset));
  }
  return dates;
}

/**
 * Resolve the local `YYYY-MM-DD` date and `HH:MM` wall-clock time a given
 * instant falls on in the supplied IANA time zone.
 */
function localDateAndTime(
  instant: Date,
  timeZone: string
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const date = `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
  const time = `${lookup('hour')}:${lookup('minute')}`;
  return { date, time };
}

/**
 * Add whole days to a `YYYY-MM-DD` date via UTC calendar arithmetic, avoiding
 * any host-zone or DST drift in the offset math.
 */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
