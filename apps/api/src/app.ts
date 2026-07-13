import type { TeeTimeReader } from '@stt/tee-time-domain/tee-time-reader';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { z } from 'zod';

/** Collaborators the HTTP app depends on, supplied by the composition root. */
export interface AppDeps {
  reader: TeeTimeReader;
}

const teeTimesQuerySchema = z.object({
  date: z.iso.date(),
});

/**
 * Build the read-only tee times HTTP app.
 *
 * @param deps - The app's injected collaborators.
 * @returns The configured Hono application.
 *
 * @example
 * ```typescript
 * const app = createApp({ reader });
 * ```
 */
export function createApp({ reader }: AppDeps): Hono {
  const app = new Hono();

  app.use('*', cors());
  app.use('*', logger());

  app.get('/tee-times', async (c) => {
    const result = teeTimesQuerySchema.safeParse({ date: c.req.query('date') });
    if (!result.success) {
      return c.json({ error: z.prettifyError(result.error) }, 400);
    }

    const { date } = result.data;
    const teeTimes = await reader.readTeeTimesForDate(date);
    const lastUpdatedAt = teeTimes.reduce<string | null>(
      (latest, teeTime) =>
        latest === null || teeTime.scrapedAt > latest ? teeTime.scrapedAt : latest,
      null
    );

    return c.json({ date, teeTimes, lastUpdatedAt });
  });

  return app;
}
