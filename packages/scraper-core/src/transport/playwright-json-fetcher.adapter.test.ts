import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page, Response } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaywrightJsonFetcher } from './playwright-json-fetcher.adapter.js';
import { TransportError } from './transport-error.js';

vi.mock('playwright-core', () => ({
  chromium: { launch: vi.fn() },
}));

const url = 'https://www.chronogolf.ca/marketplace/tee_times?id=5';

// Wire chromium.launch → browser → context → page so `fetchJson` reaches the
// given navigation response (or `null`) from `page.goto`.
function stubBrowser(response: Response | null): { page: Page } {
  const page = {
    goto: vi.fn().mockResolvedValue(response),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
  } as unknown as BrowserContext;
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
  } as unknown as Browser;
  vi.mocked(chromium.launch).mockResolvedValue(browser);
  return { page };
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
    const { page } = stubBrowser(okResponse(payload));
    const fetcher = new PlaywrightJsonFetcher();

    const result = await fetcher.fetchJson(url);

    expect(result).toEqual(payload);
    expect(page.goto).toHaveBeenCalledWith(url, { waitUntil: 'domcontentloaded' });
  });

  it('falls back to parsing the response text when json() throws', async () => {
    const payload = { teeTimes: [] };
    const response = okResponse(payload);
    vi.mocked(response.json).mockRejectedValue(new Error('not json'));
    stubBrowser(response);
    const fetcher = new PlaywrightJsonFetcher();

    const result = await fetcher.fetchJson(url);

    expect(result).toEqual(payload);
  });

  it('rejects with a TransportError exposing status and retryAfterSeconds', async () => {
    stubBrowser(failedResponse(429, { 'retry-after': '60' }));
    const fetcher = new PlaywrightJsonFetcher();

    const error = await fetcher.fetchJson(url).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 60 });
  });

  it('rejects with a TransportError carrying status but no retryAfterSeconds when the header is absent', async () => {
    stubBrowser(failedResponse(503, {}));
    const fetcher = new PlaywrightJsonFetcher();

    const error = await fetcher.fetchJson(url).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ status: 503 });
    expect((error as TransportError).retryAfterSeconds).toBeUndefined();
  });

  it('treats a missing navigation response as a transport failure', async () => {
    stubBrowser(null);
    const fetcher = new PlaywrightJsonFetcher();

    await expect(fetcher.fetchJson(url)).rejects.toBeInstanceOf(TransportError);
  });
});
