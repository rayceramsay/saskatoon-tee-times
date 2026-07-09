import type {
  ScrapeUnitKey,
  TeeTimeRepository,
} from '../persistence/tee-time-repository.port.js';
import { toTeeTime } from './tee-time.mapper.js';
import type { TeeTimeOrchestrator } from './tee-time-orchestrator.js';
import type { ScrapedTeeTime, TeeTime } from './tee-time.schema.js';

/** The scraper orchestration stage, narrowed to the one method the pipeline drives. */
type ScraperOrchestrationStage = Pick<TeeTimeOrchestrator, 'scrapeAllBookable'>;

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
    const scrapedTeeTimes = await this.orchestrator.scrapeAllBookable(now);
    const normalizedTeeTimes = scrapedTeeTimes.map((record) =>
      this.mapToTeeTime(record)
    );
    const teeTimeGroups = this.groupByScrapeUnit(normalizedTeeTimes);
    await Promise.all(
      teeTimeGroups.map((group) =>
        this.repository.replaceUnitTeeTimes(group.unitKey, group.teeTimes)
      )
    );
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
