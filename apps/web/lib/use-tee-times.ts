import useSWR from 'swr';
import { fetchTeeTimes } from './fetch-tee-times';
import type { TeeTimeResponse } from './tee-time-response.schema';

/**
 * Subscribe to a single day's tee times, keyed by date only.
 *
 * The date is the sole fetch variable — every other filter is applied
 * client-side — so SWR's key scoping discards responses for superseded dates
 * (last-write-wins). `keepPreviousData` keeps the prior day visible under the
 * loading treatment while a new date resolves.
 *
 * @param date - Local calendar date to load, formatted as `YYYY-MM-DD`.
 * @returns SWR's response, loading, and error state for that date.
 */
export function useTeeTimes(date: string) {
  return useSWR<TeeTimeResponse>(['tee-times', date], () => fetchTeeTimes(date), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
}
