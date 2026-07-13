import type { TeeTime } from './tee-time.schema.js';

/** The port persistence adapters implement to read stored tee times. */
export interface TeeTimeReader {
  /**
   * Read every stored tee time for a local calendar date.
   *
   * Returns the date's complete `TeeTime` set with no filtering applied; an
   * absent or not-yet-provisioned store resolves to an empty set rather than
   * raising.
   *
   * @param date - Local calendar date to read, formatted as `YYYY-MM-DD`.
   * @returns That date's complete tee times.
   *
   * @example
   * ```typescript
   * const teeTimes = await reader.readTeeTimesForDate('2026-07-15');
   * ```
   */
  readTeeTimesForDate(date: string): Promise<readonly TeeTime[]>;
}
