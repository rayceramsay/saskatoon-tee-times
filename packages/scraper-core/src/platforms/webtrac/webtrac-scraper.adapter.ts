import * as cheerio from 'cheerio';
import type { BookingPlatformScraper } from '../../domain/booking-platform-scraper.port.js';
import type { CourseId, GroupSize } from '@stt/tee-time-domain/primitives-schema';
import type { Booking, ScrapedTeeTime } from '@stt/tee-time-domain/tee-time-schema';
import { buildLocalStartInstant } from '@stt/tee-time-domain/local-start-instant';
import type { TextFetcher } from '../../transport/text-fetcher.port.js';
import type { WebtracCourseConfig } from './webtrac-course-config.js';

const SEARCH_URL = 'https://leisure.saskatoon.ca/webtrac/web/search.html';
// Tooltip fragment marking an available-but-phone-only row (e.g. same-day).
const PHONE_ONLY_TOOLTIP = 'Individual Allowance Rules';
const MAX_GROUP_SIZE = 4;

/**
 * Scrapes tee times for Saskatoon municipal courses booked through WebTrac.
 *
 * Holds its courses' configs privately and exposes only the config-free
 * {@link BookingPlatformScraper} surface. A single `scrape` fans out over the
 * course's hole counts, fetching one search page per count through the injected
 * {@link TextFetcher}, parsing each with cheerio, and concatenating the results.
 * WebTrac serves no per-slot price, so every record carries `dynamicPrice: null`
 * — the pricing engine resolves the course's static green fees downstream.
 */
export class WebtracScraper implements BookingPlatformScraper {
  readonly platform = 'webtrac' as const;

  constructor(
    private readonly configs: readonly WebtracCourseConfig[],
    private readonly fetcher: TextFetcher
  ) {}

  get courses(): readonly WebtracCourseConfig[] {
    return this.configs;
  }

  async scrape(courseId: CourseId, date: string): Promise<ScrapedTeeTime[]> {
    const config = this.configs.find((c) => c.courseId === courseId);
    if (!config) {
      throw new Error(`WebtracScraper cannot scrape unknown course "${courseId}"`);
    }

    const scrapedAt = new Date().toISOString();
    const pages = await Promise.all(
      config.holes.map(async (holes) => {
        const html = await this.fetcher.fetchText(buildSearchUrl(config, date, holes));
        return parsePage(html, config, scrapedAt);
      })
    );

    return pages.flat();
  }
}

/**
 * Build the WebTrac search-results request URL for one course and hole count.
 *
 * @param config - The course being scraped (supplies `secondaryCode`).
 * @param date - Local calendar date to query, formatted as `YYYY-MM-DD`.
 * @param holes - Hole count to query.
 * @returns The fully qualified search request URL.
 */
function buildSearchUrl(
  config: WebtracCourseConfig,
  date: string,
  holes: number
): string {
  const params = new URLSearchParams({
    Action: 'Start',
    SubAction: '',
    secondarycode: String(config.secondaryCode),
    begindate: toWebtracDate(date),
    begintime: '12:00 am',
    numberofholes: String(holes),
    // Single player surfaces every slot regardless of how many are open.
    numberofplayers: '1',
    display: 'Detail',
    module: 'GR',
    multiselectlist_value: '',
    grwebsearch_buttonsearch: 'yes',
  });
  return `${SEARCH_URL}?${params.toString()}`;
}

/** Format a `YYYY-MM-DD` date as the `MM/DD/YYYY` WebTrac expects. */
function toWebtracDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${month}/${day}/${year}`;
}

/**
 * Parse a WebTrac search-results page into scraped tee times.
 *
 * Pure and I/O-free. Reads rows from the results table (`tbody`, so the header
 * row is excluded), classifies each by its add-to-cart button, and drops the
 * ones that are neither online-bookable nor phone-only-available. Course
 * attribution comes from the requested `config`, never the page's course cell,
 * which is often ambiguous. A retained row missing an expected cell throws
 * rather than being silently dropped, so WebTrac markup drift fails loudly.
 *
 * @param html - The raw search-results HTML.
 * @param config - The course this page was fetched for.
 * @param scrapedAt - ISO 8601 UTC instant stamped on every record.
 * @returns The scraped tee times parsed from the page.
 */
function parsePage(
  html: string,
  config: WebtracCourseConfig,
  scrapedAt: string
): ScrapedTeeTime[] {
  const $ = cheerio.load(html);
  const teeTimes: ScrapedTeeTime[] = [];

  $('table#grwebsearch_output_table tbody tr').each((_index, element) => {
    const $row = $(element);
    const $cart = $row.find('a.cart-button').first();
    if ($cart.length === 0) return;

    const classification = classifyCart(
      $cart.hasClass('success'),
      $cart.hasClass('error'),
      $cart.attr('href')?.trim(),
      $cart.attr('data-tooltip') ?? ''
    );
    if (!classification) return;

    const cell = (title: string): string => {
      const $cell = $row.find(`td[data-title="${title}"]`);
      if ($cell.length === 0) {
        throw new Error(`WebTrac row missing "${title}" cell`);
      }
      return $cell.text().trim();
    };

    const openSlots = Number(cell('Open Slots'));
    if (!Number.isInteger(openSlots) || openSlots < 1) return;

    const { holes, startSet } = parseHolesCell(cell('Holes'));
    const localDate = toIsoDate(cell('Date'));
    const startTime = normalizeTime(cell('Time'));
    const groupSizes = buildGroupSizes(openSlots);

    teeTimes.push({
      startInstant: buildLocalStartInstant(localDate, startTime, config.timeZone),
      courseId: config.courseId,
      courseName: config.courseName,
      holes,
      routing: buildRouting(holes, startSet),
      groupSizes,
      booking: buildBooking(classification, groupSizes),
      scrapedAt,
      dynamicPrice: null,
    });
  });

  return teeTimes;
}

/**
 * Availability derived from a row's add-to-cart button, or `null` to drop it.
 *
 * Mirrors the booking arms the row can yield: a real cart URL is reservable,
 * phone-only-available carries none.
 */
type CartClassification = { kind: 'reservation'; cartUrl: string } | { kind: 'phone' };

/**
 * Classify a row's add-to-cart button into its availability.
 *
 * A `success` button with a real href is online-bookable. An `error` button
 * whose tooltip names the phone-only "Individual Allowance Rules" condition is
 * available but not online-bookable (e.g. same-day). Anything else — a placeholder
 * `#` href, an error tooltip without that condition — is dropped.
 */
function classifyCart(
  isSuccess: boolean,
  isError: boolean,
  href: string | undefined,
  tooltip: string
): CartClassification | null {
  if (isSuccess) {
    if (!href || href === '#') return null;
    return { kind: 'reservation', cartUrl: href };
  }
  if (isError && tooltip.includes(PHONE_ONLY_TOOLTIP)) {
    return { kind: 'phone' };
  }
  return null;
}

/**
 * Build a row's booking arm from its cart classification.
 *
 * @param classification - The row's classified add-to-cart button.
 * @param groupSizes - The row's valid party sizes.
 * @returns The reservation arm with a cart URL per size, or the phone arm.
 */
function buildBooking(
  classification: CartClassification,
  groupSizes: readonly GroupSize[]
): Booking {
  if (classification.kind === 'phone') return { kind: 'phone' };

  const urls: Partial<Record<GroupSize, string>> = {};
  for (const groupSize of groupSizes) {
    urls[groupSize] = withGroupSize(classification.cartUrl, groupSize);
  }
  return { kind: 'reservation', urls };
}

const HOLES_CELL = /^(\d+)(?:\s*\(([^)]+)\))?/;

/** Split a `Holes` cell (e.g. `18 (Front)`) into its count and starting set. */
function parseHolesCell(raw: string): { holes: number; startSet: string | null } {
  const match = HOLES_CELL.exec(raw);
  if (!match) {
    throw new Error(`WebTrac unparseable Holes cell: "${raw}"`);
  }
  return { holes: Number(match[1]), startSet: match[2] ?? null };
}

/** Convert a `MM/DD/YYYY` WebTrac date to `YYYY-MM-DD`. */
function toIsoDate(raw: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!match) {
    throw new Error(`WebTrac unparseable Date cell: "${raw}"`);
  }
  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

/** Normalize a WebTrac `Time` cell (e.g. ` 6:00 am`) to 24-hour `HH:mm`. */
function normalizeTime(raw: string): string {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)$/.exec(raw.trim().toLowerCase());
  if (!match) {
    throw new Error(`WebTrac unparseable Time cell: "${raw}"`);
  }
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3] === 'am' && hour === 12) hour = 0;
  if (match[3] === 'pm' && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Build the routing from a hole count and starting set.
 *
 * A 9-hole row plays only its starting set; an 18-hole row plays it plus the
 * complementary nine (`Front`→`Back`, `Back`→`Front`). A cell with no set — or
 * an 18-hole start with no known complement — yields the set(s) known, or `[]`.
 */
function buildRouting(holes: number, startSet: string | null): string[] {
  if (!startSet) return [];
  if (holes === 18) {
    const other = complementaryNine(startSet);
    if (other) return [startSet, other];
  }
  return [startSet];
}

/** The opposite nine on a two-loop Front/Back course, or `null` if unknown. */
function complementaryNine(startSet: string): string | null {
  if (startSet === 'Front') return 'Back';
  if (startSet === 'Back') return 'Front';
  return null;
}

/** The contiguous range `[1 .. min(openSlots, 4)]` of bookable group sizes. */
function buildGroupSizes(openSlots: number): GroupSize[] {
  const count = Math.min(openSlots, MAX_GROUP_SIZE);
  return Array.from({ length: count }, (_unused, index) => (index + 1) as GroupSize);
}

/** The add-to-cart URL with its slot count set to `groupSize`. */
function withGroupSize(cartUrl: string, groupSize: GroupSize): string {
  const url = new URL(cartUrl);
  url.searchParams.set('GlobalSalesArea_GRNumSlots', String(groupSize));
  return url.toString();
}
