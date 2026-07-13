/**
 * The course-local timezone all "today" / "now" / past-slot reasoning anchors to, so a
 * visitor in another timezone still sees Saskatoon's golf day.
 *
 * Future multi-city override point: a multi-city product replaces this single constant
 * (or sources it per city) rather than touching scattered date logic — every time helper
 * reads the zone from here.
 */
export const COURSE_TIME_ZONE = 'America/Regina';

/**
 * Flat advance-booking window: today through today + this many days is navigable.
 *
 * Per-course windows (union of `bookableDates` with each course's real `maxAdvanceDays`
 * and release-time gating) are deferred to a future change; this flat constant keeps the
 * first version simple.
 */
export const MAX_ADVANCE_DAYS = 7;
