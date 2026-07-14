import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import type { CapturedJsonFetcher } from './captured-json-fetcher.port.js';
import { TransportError } from './transport-error.js';

/**
 * A {@link CapturedJsonFetcher} that captures a response through a headless browser.
 *
 * Session-gated APIs (TeeOn's guest availability) return `401` to a client the
 * portal SPA has not primed, so the JSON is unreachable by navigating straight to
 * it. This adapter instead navigates the portal page and captures the SPA's own
 * request: it registers `waitForResponse` on the URL-prefix match *before*
 * `page.goto`, then reads the matched response.
 *
 * The browser and a single context are launched lazily and shared across calls;
 * call {@link close} when finished to release them.
 */
export class PlaywrightCapturedJsonFetcher implements CapturedJsonFetcher {
  private browserPromise?: Promise<Browser>;
  private contextPromise?: Promise<BrowserContext>;

  async capture(pageUrl: string, responseUrlPrefix: string): Promise<unknown> {
    const context = await this.context();
    const page = await context.newPage();
    try {
      const responsePromise = page.waitForResponse((response) =>
        response.url().startsWith(responseUrlPrefix)
      );
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
      const response = await responsePromise;
      if (!response.ok()) {
        const retryAfterSeconds = parseRetryAfter(
          response.headers()['retry-after'] ?? null
        );
        throw new TransportError(response.status(), retryAfterSeconds, response.url());
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        return JSON.parse(await response.text());
      }
    } finally {
      await page.close();
    }
  }

  /** Close the shared browser and context, if they were started. */
  async close(): Promise<void> {
    if (this.contextPromise) {
      await (await this.contextPromise).close();
      this.contextPromise = undefined;
    }
    if (this.browserPromise) {
      await (await this.browserPromise).close();
      this.browserPromise = undefined;
    }
  }

  private context(): Promise<BrowserContext> {
    this.contextPromise ??= this.browser().then((browser) => browser.newContext());
    return this.contextPromise;
  }

  private browser(): Promise<Browser> {
    this.browserPromise ??= chromium.launch({ headless: true });
    return this.browserPromise;
  }
}

// Retry-After is either a non-negative delay in seconds or an HTTP-date;
// normalize both to seconds from now (clamped at 0), else undefined.
function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds);
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.round((asDate - Date.now()) / 1000));
  }
  return undefined;
}
