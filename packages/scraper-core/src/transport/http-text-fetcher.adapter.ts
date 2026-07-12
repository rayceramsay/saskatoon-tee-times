import type { TextFetcher } from './text-fetcher.port.js';
import { TransportError } from './transport-error.js';

/**
 * A {@link TextFetcher} that fetches over plain HTTP with `fetch` (no browser).
 *
 * Suits platforms that serve text without bot protection. On a non-OK response
 * it throws the shared {@link TransportError} carrying the HTTP `status` and any
 * parsed `Retry-After`, so the same limiter retry/backoff machinery applies
 * uniformly across transports.
 */
export class HttpTextFetcher implements TextFetcher {
  async fetchText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
      throw new TransportError(response.status, retryAfterSeconds, url);
    }
    return response.text();
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
