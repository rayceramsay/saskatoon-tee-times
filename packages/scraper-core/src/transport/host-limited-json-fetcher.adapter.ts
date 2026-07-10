import type { JsonFetcher } from './json-fetcher.port.js';
import type { RequestLimiter } from './request-limiter.port.js';

/**
 * A {@link JsonFetcher} decorator that runs the wrapped fetch through a
 * {@link RequestLimiter}, keyed by the request URL's hostname.
 *
 * Limiting lives here rather than inside a transport so it stays independent of
 * how bytes arrive: this decorator implements the same {@link JsonFetcher} port
 * it wraps, so it is substitutable wherever a `JsonFetcher` is expected.
 */
export class HostLimitedJsonFetcher implements JsonFetcher {
  constructor(
    private readonly inner: JsonFetcher,
    private readonly limiter: RequestLimiter
  ) {}

  fetchJson(url: string): Promise<unknown> {
    const host = new URL(url).host;
    return this.limiter.schedule(host, () => this.inner.fetchJson(url));
  }
}
