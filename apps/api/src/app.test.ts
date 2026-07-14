import type { TeeTimeReader } from '@stt/tee-time-domain/tee-time-reader';
import type { TeeTime } from '@stt/tee-time-domain/tee-time-schema';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';
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

function rejectingReader(error: Error): TeeTimeReader {
  return {
    readTeeTimesForDate: () => Promise.reject(error),
  };
}

describe('createApp GET /tee-times', () => {
  it('returns a 200 envelope whose lastUpdatedAt is the newest scrapedAt', async () => {
    const teeTimes = [
      teeTime({ scrapedAt: '2026-07-14T18:00:00Z' }),
      teeTime({ scrapedAt: '2026-07-14T20:30:00Z' }),
      teeTime({ scrapedAt: '2026-07-14T12:00:00Z' }),
    ];
    const app = createApp({ reader: fakeReader(teeTimes), exposeErrorDetails: false });

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: '2026-07-15',
      teeTimes,
      lastUpdatedAt: '2026-07-14T20:30:00Z',
    });
  });

  it('returns a null lastUpdatedAt for an empty result', async () => {
    const app = createApp({ reader: fakeReader([]), exposeErrorDetails: false });

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: '2026-07-15',
      teeTimes: [],
      lastUpdatedAt: null,
    });
  });

  it('returns a 400 when the date parameter is missing', async () => {
    const app = createApp({ reader: fakeReader([]), exposeErrorDetails: false });

    const response = await app.request('/tee-times');

    expect(response.status).toBe(400);
  });

  it('returns a 400 when the date parameter is not a real calendar date', async () => {
    const app = createApp({ reader: fakeReader([]), exposeErrorDetails: false });

    const response = await app.request('/tee-times?date=2026-13-40');

    expect(response.status).toBe(400);
  });
});

describe('createApp error handling', () => {
  it('returns a generic 500 without error detail when exposure is disabled', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp({
      reader: rejectingReader(new Error('reader exploded')),
      exposeErrorDetails: false,
    });

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unexpected error' });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('includes the error message and stack in the 500 body when exposure is enabled', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('reader exploded');
    const app = createApp({ reader: rejectingReader(error), exposeErrorDetails: true });

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Unexpected error',
      message: 'reader exploded',
      stack: error.stack,
    });
    consoleError.mockRestore();
  });

  it('does not intercept the 400 validation path', async () => {
    const app = createApp({
      reader: rejectingReader(new Error('should not be reached')),
      exposeErrorDetails: true,
    });

    const response = await app.request('/tee-times');

    expect(response.status).toBe(400);
  });

  it('honors an HTTPException thrown while handling a request', async () => {
    const app = createApp({
      reader: rejectingReader(new HTTPException(404, { message: 'Not Found' })),
      exposeErrorDetails: false,
    });

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(404);
  });
});
