/**
 * A transport-layer failure carrying the backoff signal from a non-OK response.
 *
 * The browser transport reads the HTTP `status` and, when present, the parsed
 * `Retry-After` (in seconds) from the in-page response and raises this instead of
 * an opaque string, so the retry policy on top has structure to read.
 */
export class TransportError extends Error {
  /** HTTP status code of the failing response. */
  readonly status: number;
  /** Parsed `Retry-After` in seconds, or `undefined` when the header was absent. */
  readonly retryAfterSeconds?: number;

  constructor(status: number, retryAfterSeconds: number | undefined, url: string) {
    super(`Request failed (${status}) for ${url}`);
    this.name = 'TransportError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
