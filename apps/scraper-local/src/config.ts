import cron from 'node-cron';
import { z } from 'zod';

const environmentSchema = z.object({
  // Endpoint of the docker-compose `dynamodb-local` service.
  DYNAMODB_ENDPOINT: z.url().default('http://localhost:8000'),
  // Table the entrypoint bootstraps and writes tee times to.
  DYNAMODB_TABLE_NAME: z.string().min(1).default('tee-times-local'),
  // Cron expression controlling how often the ingestion pipeline runs. Defaults to every
  // 15 minutes (production's cadence); use e.g. '* * * * *' for fast local feedback.
  SCRAPE_CRON: z
    .string()
    .refine((value) => cron.validate(value), 'must be a valid cron expression')
    .default('*/15 * * * *'),
  // Global ceiling on concurrent browser pages across all hosts.
  SCRAPER_MAX_BROWSER_PAGES: z.coerce.number().int().positive(),
  // Per-host concurrency budget applied to any host without an override.
  SCRAPER_PER_HOST_MAX_CONCURRENT: z.coerce.number().int().positive().default(3),
  // Max attempts for a retryable (429/503) job before giving up.
  SCRAPER_MAX_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  // Longest Retry-After (seconds) we will honor before giving up on the job.
  SCRAPER_MAX_RETRY_AFTER_SECONDS: z.coerce.number().int().positive().default(30),
});

/** Runtime configuration for the local scraper entrypoint. */
export type ScraperLocalConfig = z.infer<typeof environmentSchema>;

/**
 * Build the entrypoint's configuration from environment variables.
 *
 * @returns The resolved, validated configuration.
 *
 * @example
 * ```typescript
 * const config = loadConfig();
 * ```
 */
export function loadConfig(): ScraperLocalConfig {
  const result = environmentSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Invalid scraper-local configuration:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}
