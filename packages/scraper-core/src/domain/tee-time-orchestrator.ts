import type { BookingPlatformScraper } from './booking-platform-scraper.port.js';
import type { CourseId } from './primitives.schema.js';
import type { ScrapedTeeTime } from './tee-time.schema.js';
import type { Logger } from './logger.port.js';
import { bookableDates } from './bookable-dates.util.js';

/**
 * A single unit of scraping work: one scraper, one of its courses, one date.
 */
interface ScrapeUnit {
  scraper: BookingPlatformScraper;
  courseId: CourseId;
  date: string;
}

/**
 * Fans the configured scrapers out into `(scraper, course, date)` work units
 * and runs them concurrently, isolating each unit so one failure never aborts
 * the run.
 *
 * Concurrency is decoupled from politeness by design: the orchestrator fans out
 * aggressively under `Promise.all` and holds no throttle knob — rate limiting is
 * meant to live in a single per-host choke point inside the transport layer, not
 * here. A unit that rejects contributes no records and is surfaced through the
 * injected {@link Logger}; the surviving units' records are flattened into one
 * result.
 */
export class TeeTimeOrchestrator {
  constructor(
    private readonly scrapers: readonly BookingPlatformScraper[],
    private readonly logger: Logger
  ) {}

  /**
   * Scrape every bookable `(course, date)` unit across all scrapers.
   *
   * @param now - The instant used to derive each course's bookable dates.
   * @returns The concatenation of every successful unit's scraped tee times.
   *
   * @example
   * ```typescript
   * const teeTimes = await orchestrator.orchestrate(new Date());
   * ```
   */
  async orchestrate(now: Date): Promise<ScrapedTeeTime[]> {
    const units = this.buildUnits(now);
    const unitResults = await Promise.all(units.map((unit) => this.runUnit(unit)));
    return unitResults.flat();
  }

  private buildUnits(now: Date): ScrapeUnit[] {
    const units: ScrapeUnit[] = [];
    for (const scraper of this.scrapers) {
      for (const course of scraper.courses) {
        for (const date of bookableDates(course, now)) {
          units.push({ scraper, courseId: course.courseId, date });
        }
      }
    }
    return units;
  }

  private async runUnit(unit: ScrapeUnit): Promise<ScrapedTeeTime[]> {
    try {
      return await unit.scraper.scrape(unit.courseId, unit.date);
    } catch (error) {
      this.logger.error('Scrape unit failed', {
        platform: unit.scraper.platform,
        courseId: unit.courseId,
        date: unit.date,
        error,
      });
      return [];
    }
  }
}
