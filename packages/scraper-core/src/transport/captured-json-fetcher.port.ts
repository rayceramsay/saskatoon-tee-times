/**
 * Navigates a page and returns the parsed JSON body of a response it captures.
 *
 * Some platforms (e.g. TeeOn) gate their guest API behind a session key that the
 * portal SPA injects at runtime, so a direct request to the JSON URL is rejected.
 * The only reliable path is to drive the portal page and capture the SPA's own
 * XHR response. This port exists alongside {@link JsonFetcher} rather than
 * overloading it, because its natural surface is navigate-a-page-and-capture
 * (`capture(pageUrl, responseUrlPrefix)`), not fetch-this-exact-resource.
 */
export interface CapturedJsonFetcher {
  /**
   * Navigate `pageUrl` and resolve with the parsed JSON body of the first
   * network response whose URL starts with `responseUrlPrefix`.
   *
   * @param pageUrl - The portal page to drive; also the host the fetch is keyed to.
   * @param responseUrlPrefix - URL prefix identifying the response to capture.
   * @returns The decoded JSON of the captured response, to be validated by the caller.
   */
  capture(pageUrl: string, responseUrlPrefix: string): Promise<unknown>;
}
