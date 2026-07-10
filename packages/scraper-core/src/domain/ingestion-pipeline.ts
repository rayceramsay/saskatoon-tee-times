import type {
  ScrapeUnitKey,
  TeeTimeRepository,
} from '../persistence/tee-time-repository.port.js';
import type { Logger } from './logger.port.js';
import { toTeeTime } from './tee-time.mapper.js';
import type { TeeTimeOrchestrator } from './tee-time-orchestrator.js';
import type { ScrapedTeeTime, TeeTime } from './tee-time.schema.js';

/** The scraper orchestration stage, narrowed to the methods the pipeline drives. */
type ScraperOrchestrationStage = Pick<
  TeeTimeOrchestrator,
  'scrapeAllBookable' | 'planUnitCount'
>;

/** The map stage: turns a scraped record into the canonical persisted tee time. */
type MapToTeeTime = (scraped: ScrapedTeeTime) => TeeTime;

// A tee time's start instant carries its course's local offset, so its first ten
// characters are the local `YYYY-MM-DD` — exactly the unit it was scraped under.
const LOCAL_DATE_LENGTH = 10;

interface ScrapeUnitGroup {
  unitKey: ScrapeUnitKey;
  teeTimes: TeeTime[];
}

/**
 * Composes the ordered ingestion stages — orchestrate → map → persist — into a
 * single injected unit so entrypoints run the pipeline rather than wiring the
 * stages themselves (and risk forgetting one).
 *
 * The pricing stage is intentionally absent in this slice: the map stage is a
 * pass-through, and is injected so a real pricing engine can replace it later
 * without changing this composition. Persistence is snapshot-replace per
 * `(course, date)` unit, so the flat scraped result is regrouped by unit before
 * being handed to the repository.
 */
export class IngestionPipeline {
  constructor(
    private readonly orchestrator: ScraperOrchestrationStage,
    private readonly repository: TeeTimeRepository,
    private readonly logger: Logger,
    private readonly mapToTeeTime: MapToTeeTime = toTeeTime
  ) {}

  /**
   * Run one ingestion pass: scrape every bookable unit, map the records to
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
      this.mapToTeeTime(record)
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
        await this.repository.replaceUnitTeeTimes(group.unitKey, group.teeTimes);
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
