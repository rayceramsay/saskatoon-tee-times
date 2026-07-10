import { TransportError } from './transport-error.js';

/**
 * Whether a failure is worth retrying: a {@link TransportError} whose status is
 * one the server uses to ask us to back off (429 Too Many Requests, 503 Service
 * Unavailable). Any other error propagates unchanged to the caller.
 *
 * @param error - The thrown value from a failed job.
 * @returns `true` when the error is a retryable transport failure.
 */
export function isRetryable(error: unknown): error is TransportError {
  return (
    error instanceof TransportError && (error.status === 429 || error.status === 503)
  );
}

/**
 * How long to wait before retrying a retryable failure, in milliseconds.
 *
 * Honors the server's `Retry-After` when it provided one; otherwise falls back to
 * an exponential backoff keyed on the number of retries already attempted
 * (`retryCount` 0 → 1s, 1 → 2s, 2 → 4s, …).
 *
 * @param error - The retryable transport failure.
 * @param retryCount - Retries already attempted for this job (0 on first retry).
 * @returns The wait before the next attempt, in milliseconds.
 */
export function computeRetryWaitMs(error: TransportError, retryCount: number): number {
  if (error.retryAfterSeconds !== undefined) {
    return error.retryAfterSeconds * 1000;
  }
  return 2 ** retryCount * 1000;
}
