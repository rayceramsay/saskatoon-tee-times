import { z } from 'zod';

const environmentSchema = z.object({
  // Base URL the browser calls for the read API. Prod: the same-origin `/api` CloudFront
  // origin; local dev: the local API server's origin with `/api` path (e.g. http://localhost:8787/api).
  NEXT_PUBLIC_API_BASE_URL: z.string().min(1),
});

/** Runtime configuration for the web client. */
export type WebConfig = z.infer<typeof environmentSchema>;

/**
 * Build the client configuration from `NEXT_PUBLIC_*` environment variables.
 *
 * Each variable is referenced literally so Next.js inlines it into the client bundle
 * at build time; a wholesale `process.env` parse would not be statically replaced.
 *
 * @returns The resolved, validated configuration.
 */
export function loadConfig(): WebConfig {
  const result = environmentSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  });
  if (!result.success) {
    throw new Error(`Invalid web configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Validated client configuration, resolved once at module load (fails loud on misconfig). */
export const config = loadConfig();
