import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaywrightBrowserSession } from './playwright-browser-session.js';

vi.mock('playwright-core', () => ({
  chromium: { launch: vi.fn() },
}));

function stubChromium(): { browser: Browser; context: BrowserContext } {
  const context = {
    newPage: vi.fn().mockImplementation(() => Promise.resolve({} as Page)),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrowserContext;
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Browser;
  vi.mocked(chromium.launch).mockResolvedValue(browser);
  return { browser, context };
}

describe('PlaywrightBrowserSession', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('yields pages from the shared context', async () => {
    const { context } = stubChromium();
    const session = await PlaywrightBrowserSession.launch();

    const page = await session.newPage();

    expect(page).toBe(await vi.mocked(context.newPage).mock.results[0]?.value);
    expect(context.newPage).toHaveBeenCalledTimes(1);
  });

  it('reuses one browser and one context across repeated page acquisitions', async () => {
    const { browser, context } = stubChromium();
    const session = await PlaywrightBrowserSession.launch();

    await session.newPage();
    await session.newPage();
    await session.newPage();

    expect(chromium.launch).toHaveBeenCalledTimes(1);
    expect(browser.newContext).toHaveBeenCalledTimes(1);
    expect(context.newPage).toHaveBeenCalledTimes(3);
  });

  it('releases the context and the browser on close', async () => {
    const { browser, context } = stubChromium();
    const session = await PlaywrightBrowserSession.launch();

    await session.close();

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(vi.mocked(context.close).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(browser.close).mock.invocationCallOrder[0]!
    );
  });

  it('fails at launch when chromium is unavailable', async () => {
    vi.mocked(chromium.launch).mockRejectedValue(new Error('no chromium'));

    await expect(PlaywrightBrowserSession.launch()).rejects.toThrow('no chromium');
  });
});
