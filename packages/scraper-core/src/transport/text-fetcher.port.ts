/**
 * Fetches a URL and returns its decoded body as text.
 *
 * The transport is an implementation detail: some platforms serve HTML or other
 * text over a plain request. Injecting this port keeps a scraper's `scrape` a
 * thin, testable shell that is agnostic to how the bytes arrive, mirroring
 * {@link JsonFetcher} for text-shaped responses.
 */
export interface TextFetcher {
  /**
   * Fetch `url` and return its body as an unparsed string.
   *
   * @param url - The fully qualified request URL.
   * @returns The decoded body text, to be parsed by the caller.
   */
  fetchText(url: string): Promise<string>;
}
