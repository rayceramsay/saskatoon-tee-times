import { describe, expect, it, vi } from 'vitest';
import type { TeeTimeRepository } from '../persistence/tee-time-repository.port.js';
import { IngestionPipeline } from './ingestion-pipeline.js';
import { toTeeTime } from './tee-time.mapper.js';
import type { ScrapedTeeTime } from './tee-time.schema.js';

const NOW = new Date('2026-07-08T12:00:00-06:00');

function scraped(courseId: string, date: string, time = '06:00'): ScrapedTeeTime {
  return {
    startInstant: `${date}T${time}:00-06:00`,
    courseId,
    courseName: courseId,
    holes: 18,
    routing: [],
    groupSizes: [1],
    bookingUrls: { 1: 'https://example.com' },
    scrapedAt: '2026-07-07T18:00:00Z',
    dynamicPrice: 42.5,
  };
}

function fakeRepository(): TeeTimeRepository {
  return { replaceUnitTeeTimes: vi.fn().mockResolvedValue(undefined) };
}

describe('IngestionPipeline', () => {
  it('runs scrapeAllBookable, then map, then persist in that order', async () => {
    const stageOrder: string[] = [];
    const orchestrator = {
      scrapeAllBookable: vi.fn(async () => {
        stageOrder.push('scrapeAllBookable');
        return [scraped('greenbryre', '2026-07-08')];
      }),
    };
    const mapToTeeTime = vi.fn((record: ScrapedTeeTime) => {
      stageOrder.push('map');
      return toTeeTime(record);
    });
    const repository: TeeTimeRepository = {
      replaceUnitTeeTimes: vi.fn(async () => {
        stageOrder.push('persist');
      }),
    };
    const pipeline = new IngestionPipeline(orchestrator, repository, mapToTeeTime);

    await pipeline.run(NOW);

    expect(orchestrator.scrapeAllBookable).toHaveBeenCalledWith(NOW);
    expect(stageOrder).toEqual(['scrapeAllBookable', 'map', 'persist']);
  });

  it("snapshot-replaces once per (course, date) unit with that unit's mapped tee times", async () => {
    const orchestrator = {
      scrapeAllBookable: vi.fn(async () => [
        scraped('greenbryre', '2026-07-08', '06:00'),
        scraped('greenbryre', '2026-07-08', '06:10'),
        scraped('greenbryre', '2026-07-09', '07:00'),
        scraped('holiday-park', '2026-07-08', '08:00'),
      ]),
    };
    const repository = fakeRepository();
    const pipeline = new IngestionPipeline(orchestrator, repository);

    await pipeline.run(NOW);

    const calls = vi.mocked(repository.replaceUnitTeeTimes).mock.calls;
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
      scrapeAllBookable: vi.fn(async () => [scraped('greenbryre', '2026-07-08')]),
    };
    const repository = fakeRepository();
    const pipeline = new IngestionPipeline(orchestrator, repository);

    await pipeline.run(NOW);

    const [firstCall] = vi.mocked(repository.replaceUnitTeeTimes).mock.calls;
    const teeTime = firstCall?.[1][0];
    expect(teeTime).toMatchObject({ pricePerPlayer: 42.5 });
    expect(teeTime && 'dynamicPrice' in teeTime).toBe(false);
  });

  it('persists nothing when no tee times are scraped', async () => {
    const orchestrator = {
      scrapeAllBookable: vi.fn(async () => [] as ScrapedTeeTime[]),
    };
    const repository = fakeRepository();
    const pipeline = new IngestionPipeline(orchestrator, repository);

    await pipeline.run(NOW);

    expect(repository.replaceUnitTeeTimes).not.toHaveBeenCalled();
  });
});
