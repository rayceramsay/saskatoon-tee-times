import { z } from 'zod';
import type { BookingPlatformScraper } from '../../domain/booking-platform-scraper.port.js';
import type { CourseId, GroupSize } from '../../domain/primitives.schema.js';
import type { ScrapedTeeTime } from '../../domain/tee-time.schema.js';
import { bestBookingUrl } from '../../domain/best-booking-url.util.js';
import { buildLocalStartInstant } from '../../domain/local-start-instant.util.js';
import type { JsonFetcher } from '../../transport/json-fetcher.port.js';
import type {
  ChronogolfV1CourseConfig,
  ChronogolfV1Listing,
} from './chronogolf-v1-course-config.js';

// Every listing is queried at each of these party sizes because Chronogolf
// reveals a slot's valid sizes only relative to the queried size.
const GROUP_SIZES: readonly GroupSize[] = [1, 2, 3, 4];

/**
 * Scrapes tee times for courses booked through the Chronogolf V1 platform.
 *
 * Holds its courses' richly typed configs privately and exposes only the
 * config-free {@link BookingPlatformScraper} surface. A single `scrape` fans out
 * over the course's listings and all party sizes, fetching each combination
 * through the injected {@link JsonFetcher}, then folds the per-size responses of
 * each listing together and concatenates the per-listing results.
 */
export class ChronogolfV1Scraper implements BookingPlatformScraper {
  readonly platform = 'chronogolf-v1' as const;

  constructor(
    private readonly configs: readonly ChronogolfV1CourseConfig[],
    private readonly fetcher: JsonFetcher
  ) {}

  get courses(): readonly ChronogolfV1CourseConfig[] {
    return this.configs;
  }

  async scrape(courseId: CourseId, date: string): Promise<ScrapedTeeTime[]> {
    const config = this.configs.find((c) => c.courseId === courseId);
    if (!config) {
      throw new Error(`ChronogolfV1Scraper cannot scrape unknown course "${courseId}"`);
    }

    const listingResults = await Promise.all(
      config.listings.map((listing) => this.scrapeListing(config, listing, date))
    );

    return listingResults.flat();
  }

  private async scrapeListing(
    config: ChronogolfV1CourseConfig,
    listing: ChronogolfV1Listing,
    date: string
  ): Promise<ScrapedTeeTime[]> {
    const entries = await Promise.all(
      GROUP_SIZES.map(
        async (groupSize): Promise<[GroupSize, RawChronogolfV1TeeTime[]]> => {
          const url = buildTeeTimesRequestUrl(config, {
            date,
            chronogolfCourseId: listing.chronogolfCourseId,
            nbHoles: listing.nbHoles,
            groupSize,
          });
          const json = await this.fetcher.fetchJson(url);
          return [groupSize, parseResponse(json)];
        }
      )
    );

    return mergeListing(listing, new Map(entries), config, date);
  }
}

/**
 * A single green-fee entry from a Chronogolf V1 tee-time slot.
 *
 * Present only on queries where the slot is bookable at the queried party size;
 * the first entry's `green_fee` is the raw per-player price.
 */
const RawChronogolfV1GreenFee = z.object({
  green_fee: z.number(),
});

/**
 * One tee-time object as returned by the Chronogolf V1 tee-times endpoint.
 *
 * Every availability signal is relative to the queried party size: a slot's
 * `restrictions` and `out_of_capacity` describe whether the queried group can
 * book it, so a slot must be queried at each size to learn its valid sizes.
 */
const RawChronogolfV1TeeTime = z.object({
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

type RawChronogolfV1TeeTime = z.infer<typeof RawChronogolfV1TeeTime>;

const RawChronogolfV1Response = z.array(RawChronogolfV1TeeTime);

/**
 * Inputs identifying a single Chronogolf V1 tee-times query.
 *
 * One query targets a specific listing (sub-course + hole count) on a date for
 * a specific party size.
 */
interface ChronogolfV1RequestParams {
  // Local calendar date to query, formatted as YYYY-MM-DD.
  date: string;
  // Chronogolf course_id of the listing being queried.
  chronogolfCourseId: number;
  // Hole count of the listing being queried.
  nbHoles: number;
  // Party size to query; the affiliation param is repeated once per player.
  groupSize: GroupSize;
}

/**
 * Build the Chronogolf V1 tee-times request URL for one listing query.
 *
 * The `affiliation_type_ids[]` parameter is repeated once per player because
 * Chronogolf reveals a slot's availability only relative to the queried party
 * size.
 *
 * @param config - The course's Chronogolf V1 configuration (mirror and ids).
 * @param params - The listing, date, and party size to query.
 * @returns The fully qualified request URL.
 */
function buildTeeTimesRequestUrl(
  config: ChronogolfV1CourseConfig,
  params: ChronogolfV1RequestParams
): string {
  const url = new URL(
    `https://www.chronogolf.${config.tld}/marketplace/clubs/${config.clubId}/teetimes`
  );

  url.searchParams.set('date', params.date);
  url.searchParams.set('course_id', String(params.chronogolfCourseId));
  for (let player = 0; player < params.groupSize; player++) {
    url.searchParams.append('affiliation_type_ids[]', String(config.affiliationTypeId));
  }
  url.searchParams.set('nb_holes', String(params.nbHoles));

  return url.toString();
}

/**
 * Inputs identifying one Chronogolf V1 reservation-review deep link.
 *
 * A deep link targets one slot at one party size, so it needs the slot's
 * `teeTimeId`, its listing's `chronogolfCourseId`/`nbHoles`, the queried `date`,
 * and the `groupSize` (the affiliation id is repeated once per player).
 */
interface ChronogolfV1DeepLinkParams {
  chronogolfCourseId: number;
  nbHoles: number;
  date: string;
  teeTimeId: number;
  groupSize: GroupSize;
}

/**
 * Build a rung-1 Chronogolf V1 reservation-review deep link for one slot and size.
 *
 * The hash-fragment params are assembled by hand so `affiliation_type_ids` stays
 * a comma-joined list (repeated once per player) rather than URL-encoded. The
 * host is the course's canonical `bookingTld`, never the scrape `tld` mirror.
 *
 * @param config - The course's Chronogolf V1 configuration (booking host, slug, affiliation).
 * @param params - The slot, listing, date, and party size to target.
 * @returns The reservation-review deep link URL.
 */
function buildReservationDeepLink(
  config: ChronogolfV1CourseConfig,
  params: ChronogolfV1DeepLinkParams
): string {
  const affiliationTypeIds = Array.from(
    { length: params.groupSize },
    () => config.affiliationTypeId
  ).join(',');

  const base = `https://www.chronogolf.${config.bookingTld}/club/${config.slug}/booking/?source=chronogolf&medium=profile`;
  const fragment =
    `#/teetime/review?date=${params.date}` +
    `&course_id=${params.chronogolfCourseId}` +
    `&nb_holes=${params.nbHoles}` +
    `&affiliation_type_ids=${affiliationTypeIds}` +
    `&teetime_id=${params.teeTimeId}`;

  return `${base}${fragment}`;
}

/**
 * Validate and parse a raw Chronogolf V1 tee-times JSON response.
 *
 * Pure and I/O-free: it only validates the response shape, so a change in the
 * platform's payload surfaces as a validation error rather than silent data
 * loss.
 *
 * @param json - The decoded JSON body of a Chronogolf V1 tee-times response.
 * @returns The validated tee-time records.
 */
function parseResponse(json: unknown): RawChronogolfV1TeeTime[] {
  return RawChronogolfV1Response.parse(json);
}

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
 */
function mergeListing(
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
      const deepLink = buildReservationDeepLink(config, {
        chronogolfCourseId: listing.chronogolfCourseId,
        nbHoles: listing.nbHoles,
        date,
        teeTimeId: slot.representative.id,
        groupSize,
      });
      bookingUrls[groupSize] = bestBookingUrl(deepLink, config.bookingPortalUrl);
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
      onlineBookable: true,
      scrapedAt,
      dynamicPrice: slot.dynamicPrice,
    };
  });
}
