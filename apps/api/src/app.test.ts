import type { TeeTimeReader } from '@stt/tee-time-domain/tee-time-reader';
import type { TeeTime } from '@stt/tee-time-domain/tee-time-schema';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

function teeTime(overrides: Partial<TeeTime> = {}): TeeTime {
  return {
    startInstant: '2026-07-15T06:00:00-06:00',
    courseId: 'greenbryre',
    courseName: 'Greenbryre',
    holes: 18,
    routing: [],
    groupSizes: [2, 3, 4],
    bookingUrls: { 2: 'https://example.com' },
    onlineBookable: true,
    scrapedAt: '2026-07-14T18:00:00Z',
    pricePerPlayer: 42.5,
    ...overrides,
  };
}

function fakeReader(teeTimes: readonly TeeTime[]): TeeTimeReader {
  return {
    readTeeTimesForDate: () => Promise.resolve(teeTimes),
  };
}

describe('createApp GET /tee-times', () => {
  it('returns a 200 envelope whose lastUpdatedAt is the newest scrapedAt', async () => {
    const teeTimes = [
      teeTime({ scrapedAt: '2026-07-14T18:00:00Z' }),
      teeTime({ scrapedAt: '2026-07-14T20:30:00Z' }),
      teeTime({ scrapedAt: '2026-07-14T12:00:00Z' }),
    ];
    const app = createApp({ reader: fakeReader(teeTimes) });

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: '2026-07-15',
      teeTimes,
      lastUpdatedAt: '2026-07-14T20:30:00Z',
    });
  });

  it('returns a null lastUpdatedAt for an empty result', async () => {
    const app = createApp({ reader: fakeReader([]) });

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: '2026-07-15',
      teeTimes: [],
      lastUpdatedAt: null,
    });
  });

  it('returns a 400 when the date parameter is missing', async () => {
    const app = createApp({ reader: fakeReader([]) });

    const response = await app.request('/tee-times');

    expect(response.status).toBe(400);
  });

  it('returns a 400 when the date parameter is not a real calendar date', async () => {
    const app = createApp({ reader: fakeReader([]) });

    const response = await app.request('/tee-times?date=2026-13-40');

    expect(response.status).toBe(400);
  });
});
