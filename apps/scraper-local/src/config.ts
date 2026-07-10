import { z } from 'zod';

const environmentSchema = z.object({
  // Endpoint of the docker-compose `dynamodb-local` service.
  DYNAMODB_ENDPOINT: z.url().default('http://localhost:8000'),
  // Table the entrypoint bootstraps and writes tee times to.
  DYNAMODB_TABLE_NAME: z.string().min(1).default('tee-times-local'),
  // How often the ingestion pipeline runs, in milliseconds. Defaults to 15 minutes
  SCRAPE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
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
