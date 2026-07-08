import { z } from 'zod';

/**
 * A single green-fee entry from a Chronogolf V1 tee-time slot.
 *
 * Present only on queries where the slot is bookable at the queried party size;
 * the first entry's `green_fee` is the raw per-player price.
 */
export const RawChronogolfV1GreenFee = z.object({
  green_fee: z.number(),
});

/**
 * One tee-time object as returned by the Chronogolf V1 tee-times endpoint.
 *
 * Every availability signal is relative to the queried party size: a slot's
 * `restrictions` and `out_of_capacity` describe whether the queried group can
 * book it, so a slot must be queried at each size to learn its valid sizes.
 */
export const RawChronogolfV1TeeTime = z.object({
  // Stable tee-time id — the merge key across the per-group-size queries.
  id: z.number(),
  // Local wall-clock start time as HH:mm, e.g. "06:00".
  start_time: z.string(),
  // Local calendar date as YYYY-MM-DD.
  date: z.string(),
  // The starting hole (not the hole count, which comes from the nb_holes param).
  hole: z.number(),
  // Restriction strings that apply to the queried party size; empty when none do.
  restrictions: z.array(z.string()),
  // true when the queried party cannot fit (fully booked / no room).
  out_of_capacity: z.boolean(),
  // Green fees for the queried affiliation; absent when the slot is not bookable.
  green_fees: z.array(RawChronogolfV1GreenFee).optional(),
});

export type RawChronogolfV1TeeTime = z.infer<typeof RawChronogolfV1TeeTime>;

const RawChronogolfV1Response = z.array(RawChronogolfV1TeeTime);

/**
 * Validate and parse a raw Chronogolf V1 tee-times JSON response.
 *
 * Pure and I/O-free: it only validates the response shape, so a change in the
 * platform's payload surfaces as a validation error rather than silent data
 * loss.
 *
 * @param json - The decoded JSON body of a Chronogolf V1 tee-times response.
 * @returns The validated tee-time records.
 *
 * @example
 * ```typescript
 * const teeTimes = parseResponse(await response.json());
 * ```
 */
export function parseResponse(json: unknown): RawChronogolfV1TeeTime[] {
  return RawChronogolfV1Response.parse(json);
}
