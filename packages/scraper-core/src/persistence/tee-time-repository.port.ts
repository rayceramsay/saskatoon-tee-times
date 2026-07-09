import type { CourseId } from '../domain/primitives.schema.js';
import type { TeeTime } from '../domain/tee-time.schema.js';

/**
 * Identifies a single unit of work: one course on one local calendar date.
 *
 * A scrape of a unit yields an authoritative, complete snapshot of that unit's
 * tee times, which is why persistence is keyed and replaced by this pair.
 */
export interface ScrapeUnitKey {
  courseId: CourseId;
  // Local calendar date the tee times fall on, formatted as `YYYY-MM-DD`.
  date: string;
}

/**
 * The port persistence adapters implement to store tee times.
 *
 * Transport-agnostic by design: the domain depends only on this interface, so
 * the concrete data store never leaks inward.
 */
export interface TeeTimeRepository {
  /**
   * Replace a unit's stored tee times with the supplied complete set.
   *
   * Snapshot semantics: after the call the store's contents for `unit` equal
   * `teeTimes` exactly — records absent from the set are removed and records in
   * the set are written. Because each run supplies the full current set, the
   * operation is self-healing: a partially applied or missed write is fully
   * reconciled by a subsequent call.
   *
   * @param unit - The `(courseId, date)` unit being persisted.
   * @param teeTimes - That unit's complete current tee times.
   *
   * @example
   * ```typescript
   * await repository.replaceUnitTeeTimes({ courseId: 'greenbryre', date: '2026-07-10' }, teeTimes);
   * ```
   */
  replaceUnitTeeTimes(unit: ScrapeUnitKey, teeTimes: readonly TeeTime[]): Promise<void>;
}
