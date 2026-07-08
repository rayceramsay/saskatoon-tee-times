import type { GroupSize } from '../../schema/group-size.js';
import type { ScrapedTeeTime } from '../../schema/scraped-tee-time.js';
import { buildLocalStartInstant } from '../../time/build-local-start-instant.js';
import { bestBookingUrl } from '../best-booking-url.js';
import type {
  ChronogolfV1CourseConfig,
  ChronogolfV1Listing,
} from './chronogolf-v1-config.js';
import type { RawChronogolfV1TeeTime } from './parse-response.js';

/**
 * Accumulates a single tee time's availability as the per-group-size responses
 * are merged by stable id.
 */
interface MergedSlot {
  // A representative raw slot, kept for its start_time (constant across sizes).
  representative: RawChronogolfV1TeeTime;
  // The sizes at which the slot was bookable, in encounter order.
  groupSizes: GroupSize[];
  // The first raw green fee seen on a bookable query; null until one is found.
  dynamicPrice: number | null;
}

/**
 * Merge a listing's per-group-size Chronogolf responses into scraped tee times.
 *
 * Chronogolf reveals a slot's valid party sizes only per query, so this folds
 * the four size responses together by stable tee-time id. A slot is bookable at
 * group size G when its size-G query has `out_of_capacity` false and no
 * restrictions; the merged `groupSizes` is exactly the set of such G (which may
 * be non-contiguous). Slots bookable at no size are dropped. `holes` and
 * `routing` come from the listing, and `startInstant` combines the date and the
 * slot's local start time with the course's UTC offset.
 *
 * @param listing - The listing these responses were fetched for.
 * @param responsesByGroupSize - Parsed responses keyed by the queried party size.
 * @param config - The course's Chronogolf V1 configuration.
 * @param date - The queried local calendar date, formatted as `YYYY-MM-DD`.
 * @returns The merged scraped tee times for this listing.
 *
 * @example
 * ```typescript
 * const teeTimes = mergeListing(listing, responsesByGroupSize, config, '2026-07-10');
 * ```
 */
export function mergeListing(
  listing: ChronogolfV1Listing,
  responsesByGroupSize: ReadonlyMap<GroupSize, RawChronogolfV1TeeTime[]>,
  config: ChronogolfV1CourseConfig,
  date: string
): ScrapedTeeTime[] {
  const scrapedAt = new Date().toISOString();
  const slotsById = new Map<number, MergedSlot>();

  for (const [groupSize, teeTimes] of responsesByGroupSize) {
    for (const teeTime of teeTimes) {
      const bookable = !teeTime.out_of_capacity && teeTime.restrictions.length === 0;
      if (!bookable) continue;

      let slot = slotsById.get(teeTime.id);
      if (!slot) {
        slot = { representative: teeTime, groupSizes: [], dynamicPrice: null };
        slotsById.set(teeTime.id, slot);
      }

      slot.groupSizes.push(groupSize);
      slot.dynamicPrice ??= teeTime.green_fees?.[0]?.green_fee ?? null;
    }
  }

  return [...slotsById.values()].map((slot) => {
    const groupSizes = [...slot.groupSizes].sort((a, b) => a - b);

    const bookingUrls: Partial<Record<GroupSize, string>> = {};
    for (const groupSize of groupSizes) {
      bookingUrls[groupSize] = bestBookingUrl(config.bookingPortalUrl);
    }

    return {
      startInstant: buildLocalStartInstant(
        date,
        slot.representative.start_time,
        config.timeZone
      ),
      courseId: config.courseId,
      courseName: config.courseName,
      holes: listing.nbHoles,
      routing: listing.routing,
      groupSizes,
      bookingUrls,
      scrapedAt,
      dynamicPrice: slot.dynamicPrice,
    };
  });
}
