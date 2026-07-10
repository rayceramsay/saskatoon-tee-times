import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import type { JsonFetcher } from './json-fetcher.port.js';
import { TransportError } from './transport-error.js';

/**
 * A {@link JsonFetcher} that fetches through a headless browser.
 *
 * Some platforms (Chronogolf via Cloudflare) fingerprint the client at the TLS
 * layer and reject non-browser HTTP stacks regardless of headers, so a real
 * browser is required. Each fetch navigates the page directly to the JSON URL so
 * the request carries the browser's network fingerprint, then reads the body and
 * backoff signal from the navigation response.
 *
 * The browser and a single context are launched lazily and shared across calls;
 * call {@link close} when finished to release them.
 */
export class PlaywrightJsonFetcher implements JsonFetcher {
  private browserPromise?: Promise<Browser>;
  private contextPromise?: Promise<BrowserContext>;

  async fetchJson(url: string): Promise<unknown> {
    const context = await this.context();
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (response === null) {
        throw new TransportError(0, undefined, url);
      }
      if (!response.ok()) {
        const retryAfterSeconds = parseRetryAfter(
          response.headers()['retry-after'] ?? null
        );
        throw new TransportError(response.status(), retryAfterSeconds, url);
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
