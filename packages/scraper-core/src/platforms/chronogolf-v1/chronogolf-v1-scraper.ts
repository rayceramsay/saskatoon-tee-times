import type { GroupSize } from '../../schema/group-size.js';
import type { CourseId } from '../../schema/identifiers.js';
import type { ScrapedTeeTime } from '../../schema/scraped-tee-time.js';
import type { BookingPlatformScraper } from '../booking-platform-scraper.js';
import type { JsonFetcher } from '../json-fetcher.js';
import { buildTeeTimesRequestUrl } from './build-tee-times-request-url.js';
import type {
  ChronogolfV1CourseConfig,
  ChronogolfV1Listing,
} from './chronogolf-v1-config.js';
import { mergeListing } from './merge-listing.js';
import { parseResponse, type RawChronogolfV1TeeTime } from './parse-response.js';

// Every listing is queried at each of these party sizes because Chronogolf
// reveals a slot's valid sizes only relative to the queried size.
const GROUP_SIZES: readonly GroupSize[] = [1, 2, 3, 4];

/**
 * Scrapes tee times for courses booked through the Chronogolf V1 platform.
 *
 * Holds its courses' richly typed configs privately and exposes only the
 * config-free {@link BookingPlatformScraper} surface. A single `scrape` fans out
 * over the course's listings and all party sizes, fetching each combination
 * through the injected {@link JsonFetcher}, then delegates to the pure
 * `parseResponse` + `mergeListing` functions and concatenates the per-listing
 * results.
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
