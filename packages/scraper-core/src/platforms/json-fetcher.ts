/**
 * Fetches a URL and returns its decoded JSON body.
 *
 * The transport is an implementation detail: some platforms are reachable with a
 * plain request, while others (e.g. Chronogolf behind Cloudflare) require a real
 * browser to pass bot protection. Injecting this port keeps a scraper's `scrape`
 * a thin, testable shell that is agnostic to how the bytes arrive.
 */
export interface JsonFetcher {
  /**
   * Fetch `url` and return its parsed JSON body.
   *
   * @param url - The fully qualified request URL.
   * @returns The decoded JSON, to be validated by the caller's parser.
   */
  fetchJson(url: string): Promise<unknown>;
}
