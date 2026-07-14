import { z } from 'zod';

const environmentSchema = z.object({
  // Port the local HTTP server listens on
  PORT: z.coerce.number().int().positive().default(8787),
  // Endpoint of the docker-compose `dynamodb-local` service the scraper writes to.
  DYNAMODB_ENDPOINT: z.url().default('http://localhost:8000'),
  // Table the reader queries; must match the table the scraper provisions.
  DYNAMODB_TABLE_NAME: z.string().min(1).default('tee-times-local'),
  // Minimum severity the HTTP access logger emits.
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  // Whether 500 responses include the error's message and stack; defaults off so prod fails closed.
  EXPOSE_ERROR_DETAILS: z.stringbool().default(false),
});

/** Runtime configuration for the local API entrypoint. */
export type ApiConfig = z.infer<typeof environmentSchema>;

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
export function loadConfig(): ApiConfig {
  const result = environmentSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid api configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
