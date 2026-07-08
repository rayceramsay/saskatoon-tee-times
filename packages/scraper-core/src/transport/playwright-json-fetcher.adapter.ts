import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import type { JsonFetcher } from './json-fetcher.port.js';

/**
 * A {@link JsonFetcher} that fetches through a headless browser.
 *
 * Some platforms (Chronogolf via Cloudflare) fingerprint the client at the TLS
 * layer and reject non-browser HTTP stacks regardless of headers, so a real
 * browser is required. Each fetch loads the target's origin, then issues a
 * same-origin `fetch` from within the page so the request carries the browser's
 * network fingerprint.
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
      await page.goto(new URL(url).origin, { waitUntil: 'domcontentloaded' });
      return await page.evaluate(async (target) => {
        const response = await fetch(target, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`Request failed (${response.status}) for ${target}`);
        }
        return response.json();
      }, url);
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
