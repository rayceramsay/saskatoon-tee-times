import type { RequestLimiter } from './request-limiter.port.js';
import type { TextFetcher } from './text-fetcher.port.js';

/**
 * A {@link TextFetcher} decorator that runs the wrapped fetch through a
 * {@link RequestLimiter}, keyed by the request URL's hostname.
 *
 * Limiting lives here rather than inside a transport so it stays independent of
 * how bytes arrive: this decorator implements the same {@link TextFetcher} port
 * it wraps, so it is substitutable wherever a `TextFetcher` is expected.
 */
export class HostLimitedTextFetcher implements TextFetcher {
  constructor(
    private readonly inner: TextFetcher,
    private readonly limiter: RequestLimiter
  ) {}

  fetchText(url: string): Promise<string> {
    const host = new URL(url).host;
    return this.limiter.schedule(host, () => this.inner.fetchText(url));
  }
}
