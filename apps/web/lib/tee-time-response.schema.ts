import { z } from 'zod';

/**
 * The client's Zod boundary for API responses.
 *
 * This mirrors `TeeTime` from `@stt/tee-time-domain` (the schema of record) as a
 * self-contained copy rather than importing it: the domain package uses
 * NodeNext `.js` import specifiers meant for Node services, which the static
 * client bundler cannot resolve. Keeping the mirror local also isolates the
 * client at a typed boundary — any drift from the live API fails loudly here in
 * {@link fetchTeeTimes} rather than surfacing as `undefined` in the UI.
 */

/** Valid party sizes across in-scope courses (mirrors the domain `GroupSize`). */
export const GroupSize = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type GroupSize = z.infer<typeof GroupSize>;

/** A canonical public tee time (mirrors the domain `TeeTime`). */
export const TeeTime = z.object({
  startInstant: z.iso.datetime({ offset: true }),
  courseId: z.string(),
  courseName: z.string(),
  holes: z.number().int().positive(),
  routing: z.array(z.string()),
  groupSizes: z.array(GroupSize),
  bookingUrls: z.partialRecord(GroupSize, z.string()),
  onlineBookable: z.boolean(),
  scrapedAt: z.iso.datetime(),
  pricePerPlayer: z.number().nullable(),
});
export type TeeTime = z.infer<typeof TeeTime>;

/** The `GET /tee-times?date=` response, validated at the fetch boundary. */
export const TeeTimeResponse = z.object({
  date: z.iso.date(),
  teeTimes: z.array(TeeTime),
  // Maximum `scrapedAt` across the day's results; null when the day has none.
  lastUpdatedAt: z.iso.datetime().nullable(),
});
export type TeeTimeResponse = z.infer<typeof TeeTimeResponse>;
