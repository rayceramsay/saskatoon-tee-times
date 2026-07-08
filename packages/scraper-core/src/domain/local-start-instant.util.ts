/**
 * Stamp a local calendar date and wall-clock time as an ISO 8601 instant that
 * carries the given time zone's UTC offset.
 *
 * The offset is derived from the IANA `timeZone` at that local moment rather
 * than hard-coded, so courses in other zones stamp correctly. For fixed-offset
 * zones (all currently in scope, e.g. `America/Regina`) the offset is exact.
 *
 * @param date - Local calendar date formatted as `YYYY-MM-DD`.
 * @param time - Local wall-clock time formatted as `HH:mm`.
 * @param timeZone - IANA time zone id, e.g. `"America/Regina"`.
 * @returns ISO 8601 instant with the zone's offset, e.g. `2026-07-10T06:00:00-06:00`.
 *
 * @example
 * ```typescript
 * const startInstant = buildLocalStartInstant('2026-07-10', '06:00', 'America/Regina');
 * ```
 */
export function buildLocalStartInstant(
  date: string,
  time: string,
  timeZone: string
): string {
  return `${date}T${time}:00${resolveUtcOffset(date, time, timeZone)}`;
}

/**
 * Resolve the `±HH:MM` UTC offset a time zone was at for a given local moment.
 *
 * The wall-clock components are treated as UTC to pick the instant used for the
 * lookup; for fixed-offset zones the offset is constant so this is exact.
 */
function resolveUtcOffset(date: string, time: string, timeZone: string): string {
  const approximateInstant = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(approximateInstant);
  const rawOffset = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';

  // longOffset yields e.g. "GMT-06:00", or a bare "GMT" at zero offset.
  return /GMT([+-]\d{2}:\d{2})/.exec(rawOffset)?.[1] ?? '+00:00';
}
