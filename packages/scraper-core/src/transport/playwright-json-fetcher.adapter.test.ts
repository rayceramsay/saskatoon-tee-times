import type { Page, Response } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlaywrightBrowserSession } from './playwright-browser-session.js';
import { PlaywrightJsonFetcher } from './playwright-json-fetcher.adapter.js';
import { TransportError } from './transport-error.js';

const url = 'https://www.chronogolf.ca/marketplace/tee_times?id=5';

// A session handing out one stub page whose `goto` resolves to the given
// navigation response (or `null`).
function stubSession(response: Response | null): {
  session: PlaywrightBrowserSession;
  page: Page;
} {
  const page = {
    goto: vi.fn().mockResolvedValue(response),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
  const session = {
    newPage: vi.fn().mockResolvedValue(page),
  } as unknown as PlaywrightBrowserSession;
  return { session, page };
}

function okResponse(body: unknown): Response {
  return {
    ok: () => true,
    status: () => 200,
    headers: () => ({}),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function failedResponse(status: number, headers: Record<string, string>): Response {
  return {
    ok: () => false,
    status: () => status,
    headers: () => headers,
    json: vi.fn(),
    text: vi.fn(),
  } as unknown as Response;
}

describe('PlaywrightJsonFetcher', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('navigates directly to the url and returns the parsed JSON body', async () => {
    const payload = { teeTimes: [{ time: '08:00', spots: 4 }] };
    const { session, page } = stubSession(okResponse(payload));
    const fetcher = new PlaywrightJsonFetcher(session);

    const result = await fetcher.fetchJson(url);

    expect(result).toEqual(payload);
    expect(page.goto).toHaveBeenCalledWith(url, { waitUntil: 'domcontentloaded' });
  });

  it('falls back to parsing the response text when json() throws', async () => {
    const payload = { teeTimes: [] };
    const response = okResponse(payload);
    vi.mocked(response.json).mockRejectedValue(new Error('not json'));
    const { session } = stubSession(response);
    const fetcher = new PlaywrightJsonFetcher(session);

    const result = await fetcher.fetchJson(url);

    expect(result).toEqual(payload);
  });

  it('rejects with a TransportError exposing status and retryAfterSeconds', async () => {
    const { session } = stubSession(failedResponse(429, { 'retry-after': '60' }));
    const fetcher = new PlaywrightJsonFetcher(session);

    const error = await fetcher.fetchJson(url).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 60 });
  });

  it('rejects with a TransportError carrying status but no retryAfterSeconds when the header is absent', async () => {
    const { session } = stubSession(failedResponse(503, {}));
    const fetcher = new PlaywrightJsonFetcher(session);

    const error = await fetcher.fetchJson(url).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ status: 503 });
    expect((error as TransportError).retryAfterSeconds).toBeUndefined();
  });

  it('treats a missing navigation response as a transport failure', async () => {
    const { session } = stubSession(null);
    const fetcher = new PlaywrightJsonFetcher(session);

    await expect(fetcher.fetchJson(url)).rejects.toBeInstanceOf(TransportError);
  });

  it('takes its page from the session and closes it after a successful fetch', async () => {
    const { session, page } = stubSession(okResponse({}));
    const fetcher = new PlaywrightJsonFetcher(session);

    await fetcher.fetchJson(url);

    expect(session.newPage).toHaveBeenCalledTimes(1);
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it('closes its page when the fetch throws', async () => {
    const { session, page } = stubSession(failedResponse(503, {}));
    const fetcher = new PlaywrightJsonFetcher(session);

    await fetcher.fetchJson(url).catch(() => {});

    expect(page.close).toHaveBeenCalledTimes(1);
  });
});
