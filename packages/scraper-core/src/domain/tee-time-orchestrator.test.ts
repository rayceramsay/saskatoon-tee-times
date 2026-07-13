import { describe, expect, it, vi } from 'vitest';
import type { BookingPlatformScraper } from './booking-platform-scraper.port.js';
import type { CourseConfig } from '@stt/tee-time-domain/course-config';
import type { CourseId } from '@stt/tee-time-domain/primitives-schema';
import type { ScrapedTeeTime } from '@stt/tee-time-domain/tee-time-schema';
import type { Logger } from '@stt/tee-time-domain/logger';
import { TeeTimeOrchestrator } from './tee-time-orchestrator.js';

// Past 06:00 release with a 1-day window, so each course expands to two dates.
const NOW = new Date('2026-07-08T12:00:00-06:00');

function course(courseId: string): CourseConfig {
  return {
    courseId,
    courseName: courseId,
    timeZone: 'America/Regina',
    bookingPortalUrl: 'https://example.com',
    maxAdvanceDays: 1,
    releaseTime: '06:00',
  };
}

function record(courseId: string, date: string): ScrapedTeeTime {
  return {
    startInstant: `${date}T06:00:00-06:00`,
    courseId,
    courseName: courseId,
    holes: 18,
    routing: [],
    groupSizes: [1],
    bookingUrls: { 1: 'https://example.com' },
    onlineBookable: true,
    scrapedAt: '2026-07-07T18:00:00Z',
    dynamicPrice: null,
  };
}

type ScrapeBehavior = (courseId: CourseId, date: string) => Promise<ScrapedTeeTime[]>;

class FakeScraper implements BookingPlatformScraper {
  readonly platform = 'chronogolf-v1' as const;

  constructor(
    readonly courses: readonly CourseConfig[],
    private readonly behavior: ScrapeBehavior
  ) {}

  scrape(courseId: CourseId, date: string): Promise<ScrapedTeeTime[]> {
    return this.behavior(courseId, date);
  }
}

function silentLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function unitKey(teeTime: ScrapedTeeTime): string {
  return `${teeTime.courseId}|${teeTime.startInstant.slice(0, 10)}`;
}

describe('TeeTimeOrchestrator', () => {
  it('fans every course out over its bookable dates and flattens the results', async () => {
    const scraper = new FakeScraper([course('a'), course('b')], (courseId, date) =>
      Promise.resolve([record(courseId, date)])
    );
    const orchestrator = new TeeTimeOrchestrator([scraper], silentLogger());

    const { teeTimes, unitOutcomes } = await orchestrator.scrapeAllBookable(NOW);

    expect(teeTimes.map(unitKey).sort()).toEqual([
      'a|2026-07-08',
      'a|2026-07-09',
      'b|2026-07-08',
      'b|2026-07-09',
    ]);
    expect(unitOutcomes).toHaveLength(4);
    expect(unitOutcomes.every((outcome) => outcome.status === 'ok')).toBe(true);
    expect(
      unitOutcomes.map((outcome) => `${outcome.courseId}|${outcome.date}`).sort()
    ).toEqual(['a|2026-07-08', 'a|2026-07-09', 'b|2026-07-08', 'b|2026-07-09']);
    expect(unitOutcomes.every((outcome) => outcome.recordCount === 1)).toBe(true);
  });

  it('keeps the run alive when one unit fails and surfaces that failure', async () => {
    const scraper = new FakeScraper([course('a'), course('b')], (courseId, date) => {
      if (courseId === 'a' && date === '2026-07-09') {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve([record(courseId, date)]);
    });
    const logger = silentLogger();
    const orchestrator = new TeeTimeOrchestrator([scraper], logger);

    const { teeTimes, unitOutcomes } = await orchestrator.scrapeAllBookable(NOW);

    expect(teeTimes.map(unitKey).sort()).toEqual([
      'a|2026-07-08',
      'b|2026-07-08',
      'b|2026-07-09',
    ]);
    const failed = unitOutcomes.filter((outcome) => outcome.status === 'failed');
    expect(failed).toEqual([
      expect.objectContaining({ courseId: 'a', date: '2026-07-09', recordCount: 0 }),
    ]);
    expect(unitOutcomes.filter((outcome) => outcome.status === 'ok')).toHaveLength(3);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ courseId: 'a', date: '2026-07-09' })
    );
  });
});
