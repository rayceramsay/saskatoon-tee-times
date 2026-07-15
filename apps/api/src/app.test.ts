import type { TeeTimeReader } from '@stt/tee-time-domain/tee-time-reader';
import type { TeeTime } from '@stt/tee-time-domain/tee-time-schema';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';
import { createApp, type AppDeps } from './app.js';

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

function appDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    reader: fakeReader([]),
    corsOrigin: null,
    exposeErrorDetails: false,
    ...overrides,
  };
}

describe('createApp GET /tee-times', () => {
  it('returns a 200 envelope whose lastUpdatedAt is the newest scrapedAt', async () => {
    const teeTimes = [
      teeTime({ scrapedAt: '2026-07-14T18:00:00Z' }),
      teeTime({ scrapedAt: '2026-07-14T20:30:00Z' }),
      teeTime({ scrapedAt: '2026-07-14T12:00:00Z' }),
    ];
    const app = createApp(appDeps({ reader: fakeReader(teeTimes) }));

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: '2026-07-15',
      teeTimes,
      lastUpdatedAt: '2026-07-14T20:30:00Z',
    });
  });

  it('returns a null lastUpdatedAt for an empty result', async () => {
    const app = createApp(appDeps());

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: '2026-07-15',
      teeTimes: [],
      lastUpdatedAt: null,
    });
  });

  it('returns a 400 when the date parameter is missing', async () => {
    const app = createApp(appDeps());

    const response = await app.request('/tee-times');

    expect(response.status).toBe(400);
  });

  it('returns a 400 when the date parameter is not a real calendar date', async () => {
    const app = createApp(appDeps());

    const response = await app.request('/tee-times?date=2026-13-40');

    expect(response.status).toBe(400);
  });
});

describe('createApp error handling', () => {
  it('returns a generic 500 without error detail when exposure is disabled', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp(
      appDeps({ reader: rejectingReader(new Error('reader exploded')) })
    );

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Unexpected error' });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('includes the error message and stack in the 500 body when exposure is enabled', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('reader exploded');
    const app = createApp(
      appDeps({ reader: rejectingReader(error), exposeErrorDetails: true })
    );

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
    const app = createApp(
      appDeps({
        reader: rejectingReader(new Error('should not be reached')),
        exposeErrorDetails: true,
      })
    );

    const response = await app.request('/tee-times');

    expect(response.status).toBe(400);
  });

  it('honors an HTTPException thrown while handling a request', async () => {
    const app = createApp(
      appDeps({
        reader: rejectingReader(new HTTPException(404, { message: 'Not Found' })),
      })
    );

    const response = await app.request('/tee-times?date=2026-07-15');

    expect(response.status).toBe(404);
  });
});

describe('createApp CORS', () => {
  it('allows the configured origin', async () => {
    const app = createApp(appDeps({ corsOrigin: 'https://saskatoonteetimes.ca' }));

    const response = await app.request('/tee-times?date=2026-07-15', {
      headers: { Origin: 'https://saskatoonteetimes.ca' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://saskatoonteetimes.ca'
    );
  });

  it('does not allow an origin other than the configured one', async () => {
    const app = createApp(appDeps({ corsOrigin: 'https://saskatoonteetimes.ca' }));

    const response = await app.request('/tee-times?date=2026-07-15', {
      headers: { Origin: 'https://evil.example.com' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sends no CORS headers when no origin is configured', async () => {
    const app = createApp(appDeps({ corsOrigin: null }));

    const response = await app.request('/tee-times?date=2026-07-15', {
      headers: { Origin: 'https://saskatoonteetimes.ca' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
