import { z } from 'zod';
import { CourseId, GroupSize } from './primitives.schema.js';

/**
 * How a golfer can act on a tee time, discriminated on `kind`.
 *
 * The arms are exhaustive along one axis: how much work the golfer does to reach
 * this specific slot. A deep link lands on it (`reservation`), a portal link
 * leaves them to find it themselves (`portal`), or it is not online-bookable at
 * all (`phone`).
 */
export const Booking = z.discriminatedUnion('kind', [
  // Deep link per valid group size, each landing on this slot for that party size.
  z.object({
    kind: z.literal('reservation'),
    urls: z.partialRecord(GroupSize, z.string()),
  }),
  // One link to the course's booking portal; the destination does not vary by party size.
  z.object({ kind: z.literal('portal'), url: z.string() }),
  z.object({ kind: z.literal('phone') }),
]);

export type Booking = z.infer<typeof Booking>;

/**
 * Fields common to a tee time at any stage of the ingestion pipeline.
 *
 * Captures the course, timing, routing, and booking metadata shared by every
 * pipeline stage so that stage-specific schemas can extend it with only the
 * fields they add.
 */
export const BaseTeeTime = z.object({
  // ISO 8601 instant carrying the course's local UTC offset (never UTC): the
  // calendar date/time is local to the course.
  startInstant: z.iso.datetime({ offset: true }),
  courseId: CourseId,
  // Human readable display name for the course
  courseName: z.string(),
  // Number of holes the tee time is for
  holes: z.number().int().positive(),
  // Ordered set names to be played, e.g. ["Front", "Back"] or ["North"]; [] when unknown.
  routing: z.array(z.string()),
  // Explicit valid party sizes, NOT assumed contiguous — e.g. [2, 3, 4].
  groupSizes: z.array(GroupSize),
  // How the slot can be booked; the sole statement of bookability.
  booking: Booking,
  // ISO 8601 UTC instant of the scrape.
  scrapedAt: z.iso.datetime(),
});

export type BaseTeeTime = z.infer<typeof BaseTeeTime>;

/**
 * A tee time as scraped, before pricing.
 *
 * Extends {@link BaseTeeTime} with the raw platform price so later stages can
 * derive final pricing without losing the original scraped value.
 */
export const ScrapedTeeTime = BaseTeeTime.extend({
  // Raw per-player price exactly as scraped; null when none was provided by the platform
  dynamicPrice: z.number().nullable(),
});

export type ScrapedTeeTime = z.infer<typeof ScrapedTeeTime>;

/**
 * The canonical, public, persisted tee time.
 *
 * Extends {@link BaseTeeTime} with the resolved, after-tax per-player price the
 * dashboard displays. In this slice it is produced as a pass-through of
 * {@link ScrapedTeeTime}; a later pricing engine will populate `pricePerPlayer`
 * without changing this shape or the repository that stores it.
 */
export const TeeTime = BaseTeeTime.extend({
  // Resolved after-tax per-player price shown to users; null when no price is available.
  pricePerPlayer: z.number().nullable(),
});

export type TeeTime = z.infer<typeof TeeTime>;
