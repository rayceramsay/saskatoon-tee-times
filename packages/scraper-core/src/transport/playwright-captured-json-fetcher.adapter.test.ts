import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page, Response } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaywrightCapturedJsonFetcher } from './playwright-captured-json-fetcher.adapter.js';
import { TransportError } from './transport-error.js';

vi.mock('playwright-core', () => ({
  chromium: { launch: vi.fn() },
}));

const pageUrl = 'https://admin.teeon.com/portal?facility_id=477&date=2026-07-20';
const responseUrlPrefix =
  'https://admin.teeon.com/api/2024-04/guest/tee-time?facility_id=477&date=2026-07-20';

// Wire chromium.launch → browser → context → page so `capture` resolves the
// response matched by `page.waitForResponse` once `page.goto` is called.
function stubBrowser(response: Response): { page: Page } {
  const page = {
    waitForResponse: vi.fn().mockResolvedValue(response),
    goto: vi.fn().mockResolvedValue(null),
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
    url: () => `${responseUrlPrefix}&extended=true`,
    ok: () => true,
    status: () => 200,
    headers: () => ({}),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function failedResponse(status: number, headers: Record<string, string>): Response {
  return {
    url: () => `${responseUrlPrefix}&extended=true`,
    ok: () => false,
    status: () => status,
    headers: () => headers,
    json: vi.fn(),
    text: vi.fn(),
  } as unknown as Response;
}

describe('PlaywrightCapturedJsonFetcher', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('captures the matching response and returns its parsed JSON body', async () => {
    const payload = { teeTimes: [{ start_time: '08:00', quantity_remaining: 4 }] };
    const { page } = stubBrowser(okResponse(payload));
    const fetcher = new PlaywrightCapturedJsonFetcher();

    const result = await fetcher.capture(pageUrl, responseUrlPrefix);

    expect(result).toEqual(payload);
    expect(page.goto).toHaveBeenCalledWith(pageUrl, { waitUntil: 'domcontentloaded' });
    expect(page.waitForResponse).toHaveBeenCalled();
  });

  it('matches the captured response by url prefix', async () => {
    const { page } = stubBrowser(okResponse({}));
    const fetcher = new PlaywrightCapturedJsonFetcher();

    await fetcher.capture(pageUrl, responseUrlPrefix);

    const predicate = vi.mocked(page.waitForResponse).mock.calls[0]?.[0] as (
      response: Response
    ) => boolean;
    expect(
      predicate({ url: () => `${responseUrlPrefix}&extended=true` } as Response)
    ).toBe(true);
    expect(
      predicate({ url: () => 'https://admin.teeon.com/api/2024-04/other' } as Response)
    ).toBe(false);
  });

  it('falls back to parsing the response text when json() throws', async () => {
    const payload = { teeTimes: [] };
    const response = okResponse(payload);
    vi.mocked(response.json).mockRejectedValue(new Error('not json'));
    stubBrowser(response);
    const fetcher = new PlaywrightCapturedJsonFetcher();

    const result = await fetcher.capture(pageUrl, responseUrlPrefix);

    expect(result).toEqual(payload);
  });

  it('rejects with a TransportError exposing status and retryAfterSeconds', async () => {
    stubBrowser(failedResponse(429, { 'retry-after': '60' }));
    const fetcher = new PlaywrightCapturedJsonFetcher();

    const error = await fetcher
      .capture(pageUrl, responseUrlPrefix)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 60 });
  });

  it('rejects with a TransportError carrying status but no retryAfterSeconds when the header is absent', async () => {
    stubBrowser(failedResponse(503, {}));
    const fetcher = new PlaywrightCapturedJsonFetcher();

    const error = await fetcher
      .capture(pageUrl, responseUrlPrefix)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ status: 503 });
    expect((error as TransportError).retryAfterSeconds).toBeUndefined();
  });
});
