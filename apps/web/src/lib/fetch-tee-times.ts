import { z } from 'zod';
import { config } from './config';
import { TeeTimeResponse } from './tee-time-response.schema';

/**
 * Fetch and validate a single day's tee times from the read API.
 *
 * @param date - Local calendar date to fetch, formatted as `YYYY-MM-DD`.
 * @returns The validated response for that date.
 *
 * @example
 * ```typescript
 * const { teeTimes, lastUpdatedAt } = await fetchTeeTimes('2026-07-15');
 * ```
 */
export async function fetchTeeTimes(date: string): Promise<TeeTimeResponse> {
  const url = `${config.NEXT_PUBLIC_API_BASE_URL}/tee-times?date=${date}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tee times for ${date}: ${response.status}`);
  }

  const result = TeeTimeResponse.safeParse(await response.json());
  if (!result.success) {
    throw new Error(
      `Unexpected tee times response shape for ${date}:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}
