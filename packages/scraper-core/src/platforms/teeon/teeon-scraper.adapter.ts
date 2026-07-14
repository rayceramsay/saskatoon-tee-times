import { z } from 'zod';
import type { BookingPlatformScraper } from '../../domain/booking-platform-scraper.port.js';
import type { CourseId, GroupSize } from '@stt/tee-time-domain/primitives-schema';
import type { ScrapedTeeTime } from '@stt/tee-time-domain/tee-time-schema';
import { buildLocalStartInstant } from '@stt/tee-time-domain/local-start-instant';
import type { CapturedJsonFetcher } from '../../transport/captured-json-fetcher.port.js';
import type { TeeOnCourseConfig } from './teeon-course-config.js';
import { TeeOnBookingSizeRules } from './teeon-booking-size-rules.js';

// TeeOn's guest availability endpoint. The SPA appends volatile params after
// facility_id + date, so captures match on the stable facility+date prefix.
const GUEST_TEE_TIME_ENDPOINT = 'https://admin.teeon.com/api/2024-04/guest/tee-time';
// The facility's booking-size rules; date-independent, so the prefix is keyed by
// facility only. The SPA fires it on the same portal navigation as `tee-time`.
const GUEST_SETTINGS_ENDPOINT =
  'https://admin.teeon.com/api/2024-04/guest/facility/settings/tee-sheet';

/**
 * Scrapes tee times for courses booked through the TeeOn platform.
 *
 * Holds its courses' configs privately and exposes only the config-free
 * {@link BookingPlatformScraper} surface. TeeOn's guest API is session-gated —
 * its key is injected by the portal SPA, so a direct request returns `401` — so
 * a single `scrape` drives the course's portal page for the date through the
 * injected {@link CapturedJsonFetcher} and consumes, from that one navigation,
 * both the SPA's `guest/tee-time` response and its `settings/tee-sheet` response.
 * The latter carries the facility's booking-size rules, which decide each start's
 * group sizes. TeeOn serves no per-slot price, so every record carries
 * `dynamicPrice: null`.
 */
export class TeeOnScraper implements BookingPlatformScraper {
  readonly platform = 'teeon' as const;

  constructor(
    private readonly configs: readonly TeeOnCourseConfig[],
    private readonly fetcher: CapturedJsonFetcher
  ) {}

  get courses(): readonly TeeOnCourseConfig[] {
    return this.configs;
  }

  async scrape(courseId: CourseId, date: string): Promise<ScrapedTeeTime[]> {
    const config = this.configs.find((c) => c.courseId === courseId);
    if (!config) {
      throw new Error(`TeeOnScraper cannot scrape unknown course "${courseId}"`);
    }

    const portalUrl = buildPortalUrl(config.portalUrl, date);
    const teeTimePrefix = `${GUEST_TEE_TIME_ENDPOINT}?facility_id=${config.facilityId}&date=${date}`;
    const settingsPrefix = `${GUEST_SETTINGS_ENDPOINT}?facility_id=${config.facilityId}`;

    const captured = await this.fetcher.capture(portalUrl, {
      teeTime: teeTimePrefix,
      settings: settingsPrefix,
    });
    const rows = parseResponse(captured.teeTime);
    const rules = TeeOnBookingSizeRules.fromSettings(captured.settings);

    const scrapedAt = new Date().toISOString();
    return rows.flatMap((row) =>
      buildRecords(row, config, portalUrl, rules, scrapedAt)
    );
  }
}

/**
 * One open start from a TeeOn guest `tee-time` response.
 *
 * Only the consumed fields are modeled; `turn_tee_time` is validated as an
 * object-or-null solely to gate the 18-hole fan-out on the back-nine
 * continuation's presence.
 */
const RawTeeOnTeeTime = z.object({
  // Local wall-clock start time as HH:mm, e.g. "13:28".
  start_time: z.string(),
  // Local calendar date as YYYY-MM-DD.
  date: z.string(),
  // Remaining bookable slots at this start; caps the candidate group sizes.
  quantity_remaining: z.number(),
  // Total open-slot capacity of the start; an empty start has quantity_remaining
  // equal to size, which the booking-size rules use to gate the single size.
  size: z.number(),
  // Starting nine's set name, e.g. "Front"; the 9-hole routing.
  division_title: z.string(),
  // Back nine's set name when a continuation exists, else null.
  turn_division_title: z.string().nullable(),
  // The back-nine continuation start; present only when 18 holes are bookable.
  turn_tee_time: z.object({}).nullable(),
  // "open" when the start is bookable; other values are blocked.
  blocked_type: z.string(),
});

type RawTeeOnTeeTime = z.infer<typeof RawTeeOnTeeTime>;

const RawTeeOnResponse = z.array(RawTeeOnTeeTime);

/**
 * Validate a raw TeeOn guest `tee-time` response and keep only bookable starts.
 *
 * Pure and I/O-free: it validates the response shape, so a change in TeeOn's
 * payload surfaces as a validation error rather than silent data loss. A start
 * is dropped unless its `blocked_type` is `open` and at least one slot remains.
 *
 * @param json - The decoded JSON body of a TeeOn guest `tee-time` response.
 * @returns The validated, bookable-only starts.
 */
function parseResponse(json: unknown): RawTeeOnTeeTime[] {
  return RawTeeOnResponse.parse(json).filter(
    (row) => row.blocked_type === 'open' && row.quantity_remaining >= 1
  );
}

/**
 * Fan one open start out into its 9-hole and (when applicable) 18-hole records.
 *
 * A 9-hole record (`routing: [division_title]`) is always emitted — the guest
 * feed carries no 9-vs-18 bookability signal beyond the back-nine continuation.
 * An 18-hole record (`routing: [division_title, turn_division_title]`) is added
 * only when the start carries that continuation (`turn_tee_time` present with a
 * `turn_division_title`); late-day starts lacking it yield the 9-hole record
 * alone. Both records share the start's rule-derived group sizes and the single
 * portal-with-date booking URL, and carry `dynamicPrice: null`. A start bookable
 * at no size yields no record.
 *
 * @param row - The validated open start.
 * @param config - The course this start was scraped for.
 * @param bookingUrl - The portal-with-date URL shared across every group size.
 * @param rules - The facility's booking-size rules deriving the group sizes.
 * @param scrapedAt - ISO 8601 UTC instant stamped on every record.
 * @returns The 9-hole record, plus the 18-hole record when a continuation exists; empty when no size is bookable.
 */
function buildRecords(
  row: RawTeeOnTeeTime,
  config: TeeOnCourseConfig,
  bookingUrl: string,
  rules: TeeOnBookingSizeRules,
  scrapedAt: string
): ScrapedTeeTime[] {
  const groupSizes = rules.bookableGroupSizes(row.quantity_remaining, row.size);
  if (groupSizes.length === 0) return [];

  const bookingUrls: Partial<Record<GroupSize, string>> = {};
  for (const groupSize of groupSizes) {
    bookingUrls[groupSize] = bookingUrl;
  }

  const base = {
    startInstant: buildLocalStartInstant(row.date, row.start_time, config.timeZone),
    courseId: config.courseId,
    courseName: config.courseName,
    groupSizes,
    bookingUrls,
    onlineBookable: true,
    scrapedAt,
    dynamicPrice: null,
  } as const;

  const records: ScrapedTeeTime[] = [
    { ...base, holes: 9, routing: [row.division_title] },
  ];

  if (row.turn_tee_time !== null && row.turn_division_title !== null) {
    records.push({
      ...base,
      holes: 18,
      routing: [row.division_title, row.turn_division_title],
    });
  }

  return records;
}

/** Build the portal URL with the target `date` applied as a query parameter. */
function buildPortalUrl(portalUrl: string, date: string): string {
  const url = new URL(portalUrl);
  url.searchParams.set('date', date);
  return url.toString();
}
