import { type Response } from 'playwright-core';
import type { PlaywrightBrowserSession } from './playwright-browser-session.js';
import type { CapturedJsonFetcher } from './captured-json-fetcher.port.js';
import { TransportError } from './transport-error.js';

/**
 * A {@link CapturedJsonFetcher} that captures a response through a headless browser.
 *
 * Session-gated APIs (TeeOn's guest availability) return `401` to a client the
 * portal SPA has not primed, so the JSON is unreachable by navigating straight to
 * it. This adapter instead navigates the portal page and captures the SPA's own
 * requests: it registers a `waitForResponse` per target on its URL-prefix match
 * *before* `page.goto`, so responses the page's scripts fire on load are not
 * missed, then reads each matched response.
 *
 * The browser session is injected and owned externally; this adapter only borrows
 * a page per capture and closes it.
 */
export class PlaywrightCapturedJsonFetcher implements CapturedJsonFetcher {
  constructor(private readonly session: PlaywrightBrowserSession) {}

  async capture(
    pageUrl: string,
    targets: Record<string, string>
  ): Promise<Record<string, unknown>> {
    const page = await this.session.newPage();
    try {
      const labels = Object.keys(targets);
      const responsePromises = labels.map((label) =>
        page.waitForResponse((response) => response.url().startsWith(targets[label]!))
      );
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
      const responses = await Promise.all(responsePromises);

      const bodies: Record<string, unknown> = {};
      for (const [index, label] of labels.entries()) {
        bodies[label] = await readCapturedBody(responses[index]!);
      }
      return bodies;
    } finally {
      await page.close();
    }
  }
}

// Read one captured response as JSON, throwing the shared TransportError on any
// non-OK status so the limiter's retry/backoff machinery applies uniformly.
async function readCapturedBody(response: Response): Promise<unknown> {
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
