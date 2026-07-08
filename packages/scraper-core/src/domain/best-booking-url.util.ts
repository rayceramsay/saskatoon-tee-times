/**
 * Pick the most specific available booking URL from an ordered candidate list.
 *
 * Candidates are supplied most-specific first (e.g. a tee-time deep link, then a
 * date-filtered portal, then the general portal); the first non-null one wins.
 * Because every course has a general portal fallback, a well-formed candidate
 * list always resolves — a fully empty list is a programming error and throws.
 *
 * @param candidates - Booking URL candidates, most specific first.
 * @returns The first non-null candidate.
 *
 * @example
 * ```typescript
 * const url = bestBookingUrl(deepLink, datedPortalUrl, config.bookingPortalUrl);
 * ```
 */
export function bestBookingUrl(...candidates: (string | null | undefined)[]): string {
  const url = candidates.find((candidate) => candidate != null);
  if (url == null) {
    throw new Error('bestBookingUrl requires at least one non-null candidate');
  }
  return url;
}
