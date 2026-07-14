import type { CourseConfig } from '@stt/tee-time-domain/course-config';

/**
 * Configuration for a course booked through Chronogolf V2.
 *
 * Extends the universal {@link CourseConfig} with the platform mechanics needed
 * to address Chronogolf's V2 marketplace API for this course. Every configured
 * `courseIds` value is sent on every `/marketplace/v2/teetimes` request; adding
 * a further V2 course is a config-only change.
 */
export interface ChronogolfV2CourseConfig extends CourseConfig {
  // Chronogolf V2 course uuids sent as `course_ids` on every request, comma-joined.
  courseIds: string[];
  // The club's booking URL slug, used to build user-facing deep links.
  slug: string;
  // Affiliation type id repeated once per player in each deep link.
  affiliationTypeId: number;
  // TLD of the Chronogolf mirror to query, e.g. "ca" or "com" — pins the origin.
  // A rate-limit lever, retuned freely; MUST NOT leak into user-facing links.
  tld: string;
  // Canonical user-facing Chronogolf host suffix for deep links, e.g. "ca".
  // Independent of the scrape `tld` so mirror choices never reach user links.
  bookingTld: string;
}
