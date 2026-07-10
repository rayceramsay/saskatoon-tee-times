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
