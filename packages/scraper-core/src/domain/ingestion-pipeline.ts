import type {
  ScrapeUnitKey,
  TeeTimeWriter,
} from '@stt/tee-time-domain/tee-time-writer';
import type { Logger } from '@stt/tee-time-domain/logger';
import type { PricingEngine } from './pricing-engine.js';
import type { TeeTimeOrchestrator } from './tee-time-orchestrator.js';
import type { TeeTime } from '@stt/tee-time-domain/tee-time-schema';

/** The scraper orchestration stage, narrowed to the methods the pipeline drives. */
type ScraperOrchestrationStage = Pick<
  TeeTimeOrchestrator,
  'scrapeAllBookable' | 'planUnitCount'
>;

/** The price stage, narrowed to the method the pipeline drives. */
type PricingStage = Pick<PricingEngine, 'enrich'>;

// A tee time's start instant carries its course's local offset, so its first ten
// characters are the local `YYYY-MM-DD` — exactly the unit it was scraped under.
const LOCAL_DATE_LENGTH = 10;

interface ScrapeUnitGroup {
  unitKey: ScrapeUnitKey;
  teeTimes: TeeTime[];
}

/**
 * Composes the ordered ingestion stages — orchestrate → price → persist — into a
 * single injected unit so entrypoints run the pipeline rather than wiring the
 * stages themselves (and risk forgetting one).
 *
 * The price stage finalizes each scraped record's price into the canonical tee time.
 * Persistence is snapshot-replace per `(course, date)` unit, so the flat scraped result
 * is regrouped by unit before being handed to the writer.
 */
export class IngestionPipeline {
  constructor(
    private readonly orchestrator: ScraperOrchestrationStage,
    private readonly writer: TeeTimeWriter,
    private readonly logger: Logger,
    private readonly pricingStage: PricingStage
  ) {}

  /**
   * Run one ingestion pass: scrape every bookable unit, price the records into
   * persisted tee times, and snapshot-replace each `(course, date)` unit's set.
   *
   * @param now - The instant used to derive each course's bookable dates.
   * @returns Resolves once every unit has been persisted.
   *
   * @example
   * ```typescript
   * await pipeline.run(new Date());
   * ```
   */
  async run(now: Date): Promise<void> {
    const startedAt = performance.now();

    this.logger.info('Ingestion run started', {
      queuedUnits: this.orchestrator.planUnitCount(now),
    });

    const { teeTimes: scrapedTeeTimes, unitOutcomes } =
      await this.orchestrator.scrapeAllBookable(now);

    this.logger.debug('Scrape phase complete', {
      durationMs: Math.round(performance.now() - startedAt),
    });

    const normalizedTeeTimes = scrapedTeeTimes.map((record) =>
      this.pricingStage.enrich(record)
    );
    const teeTimeGroups = this.groupByScrapeUnit(normalizedTeeTimes);

    await this.persistGroups(teeTimeGroups);

    const unitsOk = unitOutcomes.filter((outcome) => outcome.status === 'ok').length;

    this.logger.info('Ingestion run finished', {
      durationMs: Math.round(performance.now() - startedAt),
      unitsOk,
      unitsFailed: unitOutcomes.length - unitsOk,
      teeTimesPersisted: normalizedTeeTimes.length,
      groupsWritten: teeTimeGroups.length,
    });
  }

  private async persistGroups(teeTimeGroups: ScrapeUnitGroup[]): Promise<void> {
    this.logger.debug('Persisting tee time groups', {
      groupCount: teeTimeGroups.length,
    });

    await Promise.all(
      teeTimeGroups.map(async (group) => {
        await this.writer.replaceUnitTeeTimes(group.unitKey, group.teeTimes);

        this.logger.debug('Wrote tee time group', {
          courseId: group.unitKey.courseId,
          date: group.unitKey.date,
          teeTimeCount: group.teeTimes.length,
        });
      })
    );

    this.logger.debug('Persist stage finished');
  }

  private groupByScrapeUnit(teeTimes: readonly TeeTime[]): ScrapeUnitGroup[] {
    const teeTimeGroups = new Map<string, ScrapeUnitGroup>();
    for (const teeTime of teeTimes) {
      const startDate = teeTime.startInstant.slice(0, LOCAL_DATE_LENGTH);
      const key = `${teeTime.courseId}|${startDate}`;
      let group = teeTimeGroups.get(key);
      if (!group) {
        group = {
          unitKey: { courseId: teeTime.courseId, date: startDate },
          teeTimes: [],
        };
        teeTimeGroups.set(key, group);
      }
      group.teeTimes.push(teeTime);
    }
    return [...teeTimeGroups.values()];
  }
}
