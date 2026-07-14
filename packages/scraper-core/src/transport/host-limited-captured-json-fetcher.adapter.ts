import type { CapturedJsonFetcher } from './captured-json-fetcher.port.js';
import type { RequestLimiter } from './request-limiter.port.js';

/**
 * A {@link CapturedJsonFetcher} decorator that runs the wrapped capture through a
 * {@link RequestLimiter}, keyed by the navigated page URL's hostname.
 *
 * Limiting lives here rather than inside a transport so it stays independent of
 * how bytes arrive: this decorator implements the same {@link CapturedJsonFetcher}
 * port it wraps, so it is substitutable wherever a `CapturedJsonFetcher` is
 * expected.
 */
export class HostLimitedCapturedJsonFetcher implements CapturedJsonFetcher {
  constructor(
    private readonly inner: CapturedJsonFetcher,
    private readonly limiter: RequestLimiter
  ) {}

  capture(
    pageUrl: string,
    targets: Record<string, string>
  ): Promise<Record<string, unknown>> {
    const host = new URL(pageUrl).host;
    return this.limiter.schedule(host, () => this.inner.capture(pageUrl, targets));
  }
}
