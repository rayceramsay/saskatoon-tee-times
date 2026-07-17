import { describe, expect, it, vi } from 'vitest';
import type { TeeTimeWriter } from '@stt/tee-time-domain/tee-time-writer';
import { IngestionPipeline } from './ingestion-pipeline.js';
import type { Logger } from '@stt/tee-time-domain/logger';
import type { PricingEngine } from './pricing-engine.js';
import type {
  ScaperOrchestrationResult,
  ScrapeUnitOutcome,
} from './tee-time-orchestrator.js';
import type { ScrapedTeeTime, TeeTime } from '@stt/tee-time-domain/tee-time-schema';

const NOW = new Date('2026-07-08T12:00:00-06:00');

// A stub pricing stage standing in for the injected `PricingEngine`: its `enrich`
// drops `dynamicPrice` and copies it into `pricePerPlayer` so the pipeline can be
// exercised without depending on the concrete engine.
const stubPricingStage: Pick<PricingEngine, 'enrich'> = {
  enrich(scraped: ScrapedTeeTime): TeeTime {
    const { dynamicPrice, ...shared } = scraped;
    return { ...shared, pricePerPlayer: dynamicPrice };
  },
};

function scraped(courseId: string, date: string, time = '06:00'): ScrapedTeeTime {
  return {
    startInstant: `${date}T${time}:00-06:00`,
    courseId,
    courseName: courseId,
    holes: 18,
    routing: [],
    groupSizes: [1],
    booking: { kind: 'reservation', urls: { 1: 'https://example.com' } },
    scrapedAt: '2026-07-07T18:00:00Z',
    dynamicPrice: 42.5,
  };
}

function okOutcome(courseId: string, date: string, recordCount = 1): ScrapeUnitOutcome {
  return {
    platform: 'chronogolf-v1',
    courseId,
    date,
    status: 'ok',
    recordCount,
  };
}

function failedOutcome(courseId: string, date: string): ScrapeUnitOutcome {
  return {
    platform: 'chronogolf-v1',
    courseId,
    date,
    status: 'failed',
    recordCount: 0,
  };
}

// Derives one `ok` outcome per `(course, date)` unit present in the records, so
// simple tests can pass records and get a coherent result without spelling out
// outcomes; the partial-failure test supplies outcomes explicitly instead.
function deriveOkOutcomes(teeTimes: ScrapedTeeTime[]): ScrapeUnitOutcome[] {
  const counts = new Map<string, { courseId: string; date: string; count: number }>();
  for (const teeTime of teeTimes) {
    const date = teeTime.startInstant.slice(0, 10);
    const key = `${teeTime.courseId}|${date}`;
    const entry = counts.get(key) ?? { courseId: teeTime.courseId, date, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].map((entry) =>
    okOutcome(entry.courseId, entry.date, entry.count)
  );
}

function orchestrationResult(
  teeTimes: ScrapedTeeTime[],
  unitOutcomes?: ScrapeUnitOutcome[]
): ScaperOrchestrationResult {
  return { teeTimes, unitOutcomes: unitOutcomes ?? deriveOkOutcomes(teeTimes) };
}

function spyLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function fakeWriter(): TeeTimeWriter {
  return { replaceUnitTeeTimes: vi.fn().mockResolvedValue(undefined) };
}

describe('IngestionPipeline', () => {
  it('runs scrapeAllBookable, then price, then persist in that order', async () => {
    const stageOrder: string[] = [];
    const orchestrator = {
      planUnitCount: vi.fn(() => 1),
      scrapeAllBookable: vi.fn(async () => {
        stageOrder.push('scrapeAllBookable');
        return orchestrationResult([scraped('greenbryre', '2026-07-08')]);
      }),
    };
    const pricingStage = {
      enrich: vi.fn((record: ScrapedTeeTime) => {
        stageOrder.push('price');
        return stubPricingStage.enrich(record);
      }),
    };
    const writer: TeeTimeWriter = {
      replaceUnitTeeTimes: vi.fn(async () => {
        stageOrder.push('persist');
      }),
    };
    const pipeline = new IngestionPipeline(
      orchestrator,
      writer,
      spyLogger(),
      pricingStage
    );

    await pipeline.run(NOW);

    expect(orchestrator.scrapeAllBookable).toHaveBeenCalledWith(NOW);
    expect(stageOrder).toEqual(['scrapeAllBookable', 'price', 'persist']);
  });

  it("snapshot-replaces once per (course, date) unit with that unit's mapped tee times", async () => {
    const orchestrator = {
      planUnitCount: vi.fn(() => 3),
      scrapeAllBookable: vi.fn(async () =>
        orchestrationResult([
          scraped('greenbryre', '2026-07-08', '06:00'),
          scraped('greenbryre', '2026-07-08', '06:10'),
          scraped('greenbryre', '2026-07-09', '07:00'),
          scraped('holiday-park', '2026-07-08', '08:00'),
        ])
      ),
    };
    const writer = fakeWriter();
    const pipeline = new IngestionPipeline(
      orchestrator,
      writer,
      spyLogger(),
      stubPricingStage
    );

    await pipeline.run(NOW);

    const calls = vi.mocked(writer.replaceUnitTeeTimes).mock.calls;
    const byUnit = new Map(
      calls.map(([unit, teeTimes]) => [`${unit.courseId}|${unit.date}`, teeTimes])
    );

    expect(byUnit.size).toBe(3);
    expect(byUnit.get('greenbryre|2026-07-08')).toHaveLength(2);
    expect(byUnit.get('greenbryre|2026-07-09')).toHaveLength(1);
    expect(byUnit.get('holiday-park|2026-07-08')).toHaveLength(1);
  });

  it('persists the mapped tee times, not the raw scraped records', async () => {
    const orchestrator = {
      planUnitCount: vi.fn(() => 1),
      scrapeAllBookable: vi.fn(async () =>
        orchestrationResult([scraped('greenbryre', '2026-07-08')])
      ),
    };
    const writer = fakeWriter();
    const pipeline = new IngestionPipeline(
      orchestrator,
      writer,
      spyLogger(),
      stubPricingStage
    );

    await pipeline.run(NOW);

    const [firstCall] = vi.mocked(writer.replaceUnitTeeTimes).mock.calls;
    const teeTime = firstCall?.[1][0];
    expect(teeTime).toMatchObject({ pricePerPlayer: 42.5 });
    expect(teeTime && 'dynamicPrice' in teeTime).toBe(false);
  });

  it('persists nothing when no tee times are scraped', async () => {
    const orchestrator = {
      planUnitCount: vi.fn(() => 0),
      scrapeAllBookable: vi.fn(async () => orchestrationResult([])),
    };
    const writer = fakeWriter();
    const pipeline = new IngestionPipeline(
      orchestrator,
      writer,
      spyLogger(),
      stubPricingStage
    );

    await pipeline.run(NOW);

    expect(writer.replaceUnitTeeTimes).not.toHaveBeenCalled();
  });

  it('emits run started before scraping begins, reporting the planned queued-unit count', async () => {
    const logger = spyLogger();
    let startedBeforeScrape = false;
    const orchestrator = {
      planUnitCount: vi.fn(() => 2),
      scrapeAllBookable: vi.fn(async () => {
        startedBeforeScrape = vi
          .mocked(logger.info)
          .mock.calls.some(([message]) => message === 'Ingestion run started');
        return orchestrationResult([
          scraped('greenbryre', '2026-07-08'),
          scraped('holiday-park', '2026-07-08'),
        ]);
      }),
    };
    const pipeline = new IngestionPipeline(
      orchestrator,
      fakeWriter(),
      logger,
      stubPricingStage
    );

    await pipeline.run(NOW);

    expect(orchestrator.planUnitCount).toHaveBeenCalledWith(NOW);
    expect(logger.info).toHaveBeenCalledWith(
      'Ingestion run started',
      expect.objectContaining({ queuedUnits: 2 })
    );
    expect(startedBeforeScrape).toBe(true);
  });

  it('emits an info run-finished summary totaling ok/failed units, tee times, and groups', async () => {
    const orchestrator = {
      planUnitCount: vi.fn(() => 3),
      scrapeAllBookable: vi.fn(async () =>
        orchestrationResult(
          [
            scraped('greenbryre', '2026-07-08', '06:00'),
            scraped('greenbryre', '2026-07-08', '06:10'),
            scraped('holiday-park', '2026-07-08', '08:00'),
          ],
          [
            okOutcome('greenbryre', '2026-07-08', 2),
            okOutcome('holiday-park', '2026-07-08', 1),
            failedOutcome('greenbryre', '2026-07-09'),
          ]
        )
      ),
    };
    const logger = spyLogger();
    const pipeline = new IngestionPipeline(
      orchestrator,
      fakeWriter(),
      logger,
      stubPricingStage
    );

    await pipeline.run(NOW);

    expect(logger.info).toHaveBeenCalledWith(
      'Ingestion run finished',
      expect.objectContaining({
        unitsOk: 2,
        unitsFailed: 1,
        teeTimesPersisted: 3,
        groupsWritten: 2,
        durationMs: expect.any(Number),
      })
    );
  });

  it('emits persist-stage detail only at debug level', async () => {
    const orchestrator = {
      planUnitCount: vi.fn(() => 2),
      scrapeAllBookable: vi.fn(async () =>
        orchestrationResult([
          scraped('greenbryre', '2026-07-08'),
          scraped('holiday-park', '2026-07-08'),
        ])
      ),
    };
    const logger = spyLogger();
    const pipeline = new IngestionPipeline(
      orchestrator,
      fakeWriter(),
      logger,
      stubPricingStage
    );

    await pipeline.run(NOW);

    expect(logger.debug).toHaveBeenCalledWith(
      'Persisting tee time groups',
      expect.objectContaining({ groupCount: 2 })
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'Wrote tee time group',
      expect.objectContaining({ courseId: 'greenbryre', teeTimeCount: 1 })
    );
    expect(logger.debug).toHaveBeenCalledWith('Persist stage finished');
  });
});
