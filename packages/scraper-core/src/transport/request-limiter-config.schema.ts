import { z } from 'zod';

/**
 * Configuration shape for the request limiter.
 *
 * Keyed by hostname with a single default plus optional per-host overrides —
 * never per course or per platform.
 */
export const RequestLimiterConfig = z.object({
  // Per-host concurrency budget. Two jobs on the same host share this
  // budget; different hosts run under independent budgets.
  perHost: z
    .object({
      // Cap applied to any host without an override.
      default: z
        .object({
          maxConcurrent: z.number().int().positive().default(3),
        })
        .prefault({}),
      // Per-hostname overrides, keyed by hostname, for the few hosts the default proves too hot for.
      overrides: z
        .record(z.string(), z.object({ maxConcurrent: z.number().int().positive() }))
        .default({}),
    })
    .prefault({}),
  // Global ceiling on concurrent jobs across all hosts, representing this
  // instance's compute/politeness budget independent of transport.
  globalMaxConcurrent: z.number().int().positive(),
  // Retry/backoff thresholds.
  retry: z.object({
    // Maximum attempts for a retryable (429/503) job before giving up.
    maxAttempts: z.number().int().positive(),
    // Longest Retry-After (seconds) we will honor; over this we give up on the
    // job without pausing the host and let the next run recover it.
    maxRetryAfterSeconds: z.number().int().positive().default(30),
  }),
});

export type RequestLimiterConfig = z.infer<typeof RequestLimiterConfig>;
