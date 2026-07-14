/**
 * Navigates a page once and returns the parsed JSON bodies of responses it captures.
 *
 * Some platforms (e.g. TeeOn) gate their guest API behind a session key that the
 * portal SPA injects at runtime, so a direct request to the JSON URL is rejected.
 * The only reliable path is to drive the portal page and capture the SPA's own
 * XHR responses. A single navigation can also yield several responses of interest,
 * so `capture` takes a label-keyed map of URL prefixes and resolves the parsed
 * bodies under the same labels. This port exists alongside {@link JsonFetcher}
 * rather than overloading it, because its natural surface is navigate-a-page-and-
 * capture, not fetch-this-exact-resource.
 */
export interface CapturedJsonFetcher {
  /**
   * Navigate `pageUrl` once and resolve the parsed JSON bodies of the responses
   * captured for each target, keyed by the same labels as `targets`.
   *
   * Each target's body is the first network response whose URL starts with that
   * label's prefix. Waiters are registered for every target before navigating, so
   * responses the page's scripts issue on load are not missed.
   *
   * @param pageUrl - The portal page to drive; also the host the fetch is keyed to.
   * @param targets - Label-keyed map of URL prefixes identifying the responses to capture.
   * @returns The decoded JSON of each captured response under its label, to be validated by the caller.
   */
  capture(
    pageUrl: string,
    targets: Record<string, string>
  ): Promise<Record<string, unknown>>;
}
