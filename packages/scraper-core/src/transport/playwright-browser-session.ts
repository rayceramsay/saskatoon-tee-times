import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright-core';

/**
 * A live Chromium browser and context shared by browser-backed transports.
 *
 * Owns the browser process so the transports do not: a composition root launches
 * one session, injects it into every browser-backed transport, and closes it once,
 * keeping a scrape to a single Chromium process. The session's lifetime belongs to
 * that root.
 *
 * @example
 * ```typescript
 * const session = await PlaywrightBrowserSession.launch();
 * try {
 *   const fetcher = new PlaywrightJsonFetcher(session);
 *   await fetcher.fetchJson(url);
 * } finally {
 *   await session.close();
 * }
 * ```
 */
export class PlaywrightBrowserSession {
  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext
  ) {}

  /**
   * Launch the browser and open the shared context.
   *
   * @returns A live session, ready to hand out pages.
   */
  static async launch(): Promise<PlaywrightBrowserSession> {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    return new PlaywrightBrowserSession(browser, context);
  }

  /** Open a page on the shared context; the caller closes it. */
  newPage(): Promise<Page> {
    return this.context.newPage();
  }

  /** Release the shared context and the browser process. */
  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}
