import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page, Response } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaywrightCapturedJsonFetcher } from './playwright-captured-json-fetcher.adapter.js';
import { TransportError } from './transport-error.js';

vi.mock('playwright-core', () => ({
  chromium: { launch: vi.fn() },
}));

const pageUrl = 'https://admin.teeon.com/portal?facility_id=477&date=2026-07-20';
const teeTimePrefix =
  'https://admin.teeon.com/api/2024-04/guest/tee-time?facility_id=477&date=2026-07-20';
const settingsPrefix =
  'https://admin.teeon.com/api/2024-04/guest/facility/settings/tee-sheet?facility_id=477';

// Wire chromium.launch → browser → context → page so `capture` resolves each
// target: `page.waitForResponse` routes a call to the first stubbed response its
// predicate matches, mirroring how Playwright matches by URL prefix.
function stubBrowser(responses: Response[]): { page: Page } {
  const page = {
    waitForResponse: vi
      .fn()
      .mockImplementation((predicate: (response: Response) => boolean) =>
        Promise.resolve(responses.find((response) => predicate(response)))
      ),
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

function okResponse(url: string, body: unknown): Response {
  return {
    url: () => url,
    ok: () => true,
    status: () => 200,
    headers: () => ({}),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function failedResponse(
  url: string,
  status: number,
  headers: Record<string, string>
): Response {
  return {
    url: () => url,
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

  it('captures a single target and returns its parsed JSON body under its label', async () => {
    const payload = { teeTimes: [{ start_time: '08:00', quantity_remaining: 4 }] };
    const { page } = stubBrowser([
      okResponse(`${teeTimePrefix}&extended=true`, payload),
    ]);
    const fetcher = new PlaywrightCapturedJsonFetcher();

    const result = await fetcher.capture(pageUrl, { teeTime: teeTimePrefix });

    expect(result).toEqual({ teeTime: payload });
    expect(page.goto).toHaveBeenCalledWith(pageUrl, { waitUntil: 'domcontentloaded' });
    expect(page.waitForResponse).toHaveBeenCalledTimes(1);
  });

  it('captures multiple targets from one navigation, keyed by label', async () => {
    const teeTimeBody = { teeTimes: [1, 2, 3] };
    const settingsBody = { single_bookings: 'allow_within_group' };
    const { page } = stubBrowser([
      okResponse(`${teeTimePrefix}&extended=true`, teeTimeBody),
      okResponse(`${settingsPrefix}&locale=en`, settingsBody),
    ]);
    const fetcher = new PlaywrightCapturedJsonFetcher();

    const result = await fetcher.capture(pageUrl, {
      teeTime: teeTimePrefix,
      settings: settingsPrefix,
    });

    expect(result).toEqual({ teeTime: teeTimeBody, settings: settingsBody });
    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(page.waitForResponse).toHaveBeenCalledTimes(2);
  });

  it('registers every waiter before navigating so load-time responses are not missed', async () => {
    const { page } = stubBrowser([
      okResponse(`${teeTimePrefix}&extended=true`, {}),
      okResponse(`${settingsPrefix}&locale=en`, {}),
    ]);
    const fetcher = new PlaywrightCapturedJsonFetcher();

    await fetcher.capture(pageUrl, {
      teeTime: teeTimePrefix,
      settings: settingsPrefix,
    });

    const waitOrder = vi.mocked(page.waitForResponse).mock.invocationCallOrder;
    const gotoOrder = vi.mocked(page.goto).mock.invocationCallOrder[0]!;
    for (const order of waitOrder) {
      expect(order).toBeLessThan(gotoOrder);
    }
  });

  it('matches each captured response by its target url prefix', async () => {
    const { page } = stubBrowser([okResponse(`${teeTimePrefix}&extended=true`, {})]);
    const fetcher = new PlaywrightCapturedJsonFetcher();

    await fetcher.capture(pageUrl, { teeTime: teeTimePrefix });

    const predicate = vi.mocked(page.waitForResponse).mock.calls[0]?.[0] as (
      response: Response
    ) => boolean;
    expect(predicate({ url: () => `${teeTimePrefix}&extended=true` } as Response)).toBe(
      true
    );
    expect(
      predicate({ url: () => 'https://admin.teeon.com/api/2024-04/other' } as Response)
    ).toBe(false);
  });

  it('falls back to parsing the response text when json() throws', async () => {
    const payload = { teeTimes: [] };
    const response = okResponse(`${teeTimePrefix}&extended=true`, payload);
    vi.mocked(response.json).mockRejectedValue(new Error('not json'));
    stubBrowser([response]);
    const fetcher = new PlaywrightCapturedJsonFetcher();

    const result = await fetcher.capture(pageUrl, { teeTime: teeTimePrefix });

    expect(result).toEqual({ teeTime: payload });
  });

  it('rejects with a TransportError when any captured target is non-OK', async () => {
    stubBrowser([
      okResponse(`${teeTimePrefix}&extended=true`, {}),
      failedResponse(`${settingsPrefix}&locale=en`, 429, { 'retry-after': '60' }),
    ]);
    const fetcher = new PlaywrightCapturedJsonFetcher();

    const error = await fetcher
      .capture(pageUrl, { teeTime: teeTimePrefix, settings: settingsPrefix })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 60 });
  });

  it('rejects with a TransportError carrying status but no retryAfterSeconds when the header is absent', async () => {
    stubBrowser([failedResponse(`${teeTimePrefix}&extended=true`, 503, {})]);
    const fetcher = new PlaywrightCapturedJsonFetcher();

    const error = await fetcher
      .capture(pageUrl, { teeTime: teeTimePrefix })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ status: 503 });
    expect((error as TransportError).retryAfterSeconds).toBeUndefined();
  });
});
