import { z } from 'zod';
import { CourseId, GroupSize } from './primitives.schema.js';

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
  // Best booking URL per valid group size.
  bookingUrls: z.partialRecord(GroupSize, z.string()),
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
