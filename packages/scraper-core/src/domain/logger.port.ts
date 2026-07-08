/**
 * A minimal structured-logging port the domain depends on to surface events
 * without binding to a concrete logging library.
 *
 * Adapters map these calls onto whatever sink the runtime uses (console,
 * CloudWatch, etc.); the domain only needs a way to make a failure or warning
 * observable rather than silently swallowed.
 */
export interface Logger {
  // Report a non-fatal condition worth attention that did not stop the run.
  warn(message: string, context?: Record<string, unknown>): void;
  // Report a failure that occurred, even if it was isolated and recovered from.
  error(message: string, context?: Record<string, unknown>): void;
}
