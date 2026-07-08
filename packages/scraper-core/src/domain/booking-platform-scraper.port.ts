import type { CourseId, PlatformId } from './primitives.schema.js';
import type { ScrapedTeeTime } from './tee-time.schema.js';
import type { CourseConfig } from './course-config.base.js';

/**
 * The contract every platform scraper implements.
 *
 * The surface is deliberately config-free so an orchestrator can hold a
 * heterogeneous list of scrapers without their per-platform config types
 * leaking into it; each implementation keeps its own richly typed config
 * private. A single scrape call MAY issue multiple HTTP requests internally —
 * the request count is an implementation detail private to the scraper.
 */
export interface BookingPlatformScraper {
  // Stable identifier for the platform this scraper handles.
  readonly platform: PlatformId;
  // The courses this scraper can serve.
  readonly courses: readonly CourseConfig[];

  /**
   * Scrape all tee times for one of this scraper's courses on a given date.
   *
   * @param courseId - Identifies which of this scraper's courses to scrape.
   * @param date - Local calendar date to scrape, formatted as `YYYY-MM-DD`.
   * @returns The normalized tee times available for that course and date.
   */
  scrape(courseId: CourseId, date: string): Promise<ScrapedTeeTime[]>;
}
