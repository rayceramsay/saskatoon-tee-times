import { z } from 'zod';
import type { BookingPlatformScraper } from '../../domain/booking-platform-scraper.port.js';
import type { CourseId, GroupSize } from '@stt/tee-time-domain/primitives-schema';
import type { ScrapedTeeTime } from '@stt/tee-time-domain/tee-time-schema';
import { bestBookingUrl } from '@stt/tee-time-domain/best-booking-url';
import { buildLocalStartInstant } from '@stt/tee-time-domain/local-start-instant';
import type { JsonFetcher } from '../../transport/json-fetcher.port.js';
import type { ChronogolfV2CourseConfig } from './chronogolf-v2-course-config.js';

/**
 * Scrapes tee times for courses booked through the Chronogolf V2 platform.
 *
 * Holds its courses' richly typed configs privately and exposes only the
 * config-free {@link BookingPlatformScraper} surface. Because the V2 feed is
 * paginated, a single `scrape` walks `page=1,2,3…` sequentially through the
 * injected {@link JsonFetcher} — the next page's existence is known only once the
 * current page returns non-empty — stopping at the first empty page, then fans
 * each tee time out over its bookable hole counts.
 */
export class ChronogolfV2Scraper implements BookingPlatformScraper {
  readonly platform = 'chronogolf-v2' as const;

  constructor(
    private readonly configs: readonly ChronogolfV2CourseConfig[],
    private readonly fetcher: JsonFetcher
  ) {}

  get courses(): readonly ChronogolfV2CourseConfig[] {
    return this.configs;
  }

  async scrape(courseId: CourseId, date: string): Promise<ScrapedTeeTime[]> {
    const config = this.configs.find((c) => c.courseId === courseId);
    if (!config) {
      throw new Error(`ChronogolfV2Scraper cannot scrape unknown course "${courseId}"`);
    }

    const scrapedAt = new Date().toISOString();
    const teeTimes: ScrapedTeeTime[] = [];

    for (let page = 1; ; page++) {
      const url = buildTeeTimesRequestUrl(config, date, page);
      const rawTeeTimesResponse = await this.fetcher.fetchJson(url);
      const rawTeeTimes = parseResponse(rawTeeTimesResponse);
      if (rawTeeTimes.length === 0) break;

      for (const rawTeeTime of rawTeeTimes) {
        teeTimes.push(...buildRecords(rawTeeTime, config, scrapedAt));
      }
    }

    return teeTimes;
  }
}

/**
 * The public green-fee line on a Chronogolf V2 tee time.
 *
 * Scoped to a single hole count (`bookable_holes`): the fee applies only to a
 * record whose hole count matches. Null when the feed exposes no price.
 */
const RawChronogolfV2DefaultPrice = z.object({
  green_fee: z.number(),
  bookable_holes: z.number(),
});

/**
 * One tee-time object from the Chronogolf V2 `/marketplace/v2/teetimes` feed.
 *
 * Availability is stated inline: a slot carries its bookable party sizes as
 * `min_player_size`/`max_player_size` and its bookable hole counts as
 * `course.bookable_holes`, so no per-size or per-hole re-query is needed.
 */
const RawChronogolfV2TeeTime = z.object({
  // Stable tee-time id, unique per physical loop; used as the booking deep-link key.
  id: z.number(),
  course: z.object({
    // Physical loop name, e.g. "Lakes"; sourced into routing per record.
    name: z.string(),
    // Hole counts this start can be booked at, e.g. [9, 18]; the fan-out axis.
    bookable_holes: z.array(z.number()),
  }),
  // Local wall-clock start time as H:mm or HH:mm, e.g. "7:03".
  start_time: z.string(),
  // Local calendar date as YYYY-MM-DD.
  date: z.string(),
  // Smallest bookable party size for this slot.
  min_player_size: z.number(),
  // Largest bookable party size for this slot.
  max_player_size: z.number(),
  // Public green-fee line scoped to one hole count; null when unpriced.
  default_price: RawChronogolfV2DefaultPrice.nullable(),
});

type RawChronogolfV2TeeTime = z.infer<typeof RawChronogolfV2TeeTime>;

/**
 * One page of the Chronogolf V2 tee-times feed.
 *
 * An empty `teetimes` array is the pagination stop signal (the page's `status`
 * is ignored so the terminal condition keys off data, not a label).
 */
const RawChronogolfV2Response = z.object({
  teetimes: z.array(RawChronogolfV2TeeTime),
});

/**
 * Build the Chronogolf V2 tee-times request URL for one page.
 *
 * Every configured `courseIds` value is sent comma-joined on every request; the
 * physical-loop uuids plus the `18` combined-round toggle together unlock
 * `bookable_holes: [9, 18]`.
 *
 * @param config - The course's Chronogolf V2 configuration (host and course ids).
 * @param date - Local calendar date to query, formatted as `YYYY-MM-DD`.
 * @param page - 1-based page number to request.
 * @returns The fully qualified request URL.
 */
function buildTeeTimesRequestUrl(
  config: ChronogolfV2CourseConfig,
  date: string,
  page: number
): string {
  const url = new URL(`https://www.chronogolf.${config.tld}/marketplace/v2/teetimes`);

  url.searchParams.set('start_date', date);
  url.searchParams.set('course_ids', config.courseIds.join(','));
  url.searchParams.set('page', String(page));

  return url.toString();
}

/**
 * Build a rung-1 Chronogolf V2 reservation-review deep link for one slot and size.
 *
 * The hash-fragment params are assembled by hand so `affiliation_type_ids` stays
 * a comma-joined list (repeated once per player) rather than URL-encoded. The V2
 * fragment omits V1's `date`/`course_id` and appends `engine=2`. The host is the
 * course's canonical `bookingTld`, never the scrape `tld` mirror.
 *
 * @param config - The course's Chronogolf V2 configuration (booking host, slug, affiliation).
 * @param teeTimeId - The slot's stable tee-time id.
 * @param holes - The record's hole count, sent as `nb_holes`.
 * @param groupSize - Party size; the affiliation id is repeated once per player.
 * @returns The reservation-review deep link URL.
 */
function buildReservationDeepLink(
  config: ChronogolfV2CourseConfig,
  teeTimeId: number,
  holes: number,
  groupSize: GroupSize
): string {
  const affiliationTypeIds = Array.from(
    { length: groupSize },
    () => config.affiliationTypeId
  ).join(',');

  const base = `https://www.chronogolf.${config.bookingTld}/club/${config.slug}/booking/?source=chronogolf&medium=profile`;
  const fragment =
    `#/teetime/review?affiliation_type_ids=${affiliationTypeIds}` +
    `&teetime_id=${teeTimeId}` +
    `&nb_holes=${holes}` +
    `&engine=2`;

  return `${base}${fragment}`;
}

/**
 * Validate and parse one raw Chronogolf V2 tee-times page.
 *
 * Pure and I/O-free: it validates only the consumed fields, so a change in the
 * platform's payload surfaces as a validation error rather than silent data
 * loss.
 *
 * @param json - The decoded JSON body of one Chronogolf V2 tee-times page.
 * @returns The validated tee-time records on that page.
 */
function parseResponse(json: unknown): RawChronogolfV2TeeTime[] {
  return RawChronogolfV2Response.parse(json).teetimes;
}

/**
 * Fan one raw Chronogolf V2 tee time out into scraped records, one per hole count.
 *
 * Group sizes are the inline contiguous range `[min_player_size .. max_player_size]`
 * intersected with the bookable sizes; a slot yielding no sizes is dropped
 * (returns `[]`). Each retained slot emits one record per `course.bookable_holes`
 * entry, all with single-element `routing: [course.name]`, so same-time starts on
 * different loops stay distinct. `dynamicPrice` is the raw green fee only on the
 * hole count `default_price` covers, else null (no tax applied here).
 *
 * @param rawTeeTime - One parsed tee time from a V2 page.
 * @param config - The course's Chronogolf V2 configuration.
 * @param scrapedAt - ISO 8601 UTC instant stamped on every emitted record.
 * @returns The fanned-out scraped records (possibly empty).
 */
function buildRecords(
  rawTeeTime: RawChronogolfV2TeeTime,
  config: ChronogolfV2CourseConfig,
  scrapedAt: string
): ScrapedTeeTime[] {
  const groupSizes = contiguousGroupSizes(
    rawTeeTime.min_player_size,
    rawTeeTime.max_player_size
  );
  if (groupSizes.length === 0) return [];

  const startInstant = buildLocalStartInstant(
    rawTeeTime.date,
    normalizeStartTime(rawTeeTime.start_time),
    config.timeZone
  );

  return rawTeeTime.course.bookable_holes.map((holes) => {
    const bookingUrls: Partial<Record<GroupSize, string>> = {};
    for (const groupSize of groupSizes) {
      const deepLink = buildReservationDeepLink(
        config,
        rawTeeTime.id,
        holes,
        groupSize
      );
      bookingUrls[groupSize] = bestBookingUrl(deepLink, config.bookingPortalUrl);
    }

    const dynamicPrice =
      rawTeeTime.default_price?.bookable_holes === holes
        ? rawTeeTime.default_price.green_fee
        : null;

    return {
      startInstant,
      courseId: config.courseId,
      courseName: config.courseName,
      holes,
      routing: [rawTeeTime.course.name],
      groupSizes,
      bookingUrls,
      onlineBookable: true,
      scrapedAt,
      dynamicPrice,
    };
  });
}

/**
 * The inline contiguous range `[min .. max]` restricted to the valid group sizes.
 *
 * @param min - Reported minimum bookable party size.
 * @param max - Reported maximum bookable party size.
 * @returns The ascending valid group sizes in range; empty when none apply.
 */
function contiguousGroupSizes(min: number, max: number): GroupSize[] {
  const groupSizes: GroupSize[] = [];
  for (let size = min; size <= max; size++) {
    if (size >= 1 && size <= 4) groupSizes.push(size as GroupSize);
  }
  return groupSizes;
}

/**
 * Zero-pad a Chronogolf V2 `start_time` hour so it forms a valid `HH:mm`.
 *
 * The feed returns single-digit morning hours (e.g. `"7:03"`) that would make an
 * invalid ISO instant, so the hour is padded before stamping.
 */
function normalizeStartTime(startTime: string): string {
  const [hour = '', minute = ''] = startTime.split(':');
  return `${hour.padStart(2, '0')}:${minute}`;
}
