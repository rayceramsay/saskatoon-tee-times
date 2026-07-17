import type { TeeOnCourseConfig } from '../teeon-course-config.js';

/**
 * TeeOn booking configuration for The Legends Golf Club (Warman).
 *
 * A single scrape drives `bookingPortalUrl` for the target date and captures the
 * session-gated guest feed for `facilityId` 477.
 */
export const theLegendsConfig: TeeOnCourseConfig = {
  courseId: 'the-legends',
  courseName: 'The Legends',
  timeZone: 'America/Regina',
  bookingPortalUrl:
    'https://admin.teeon.com/portal/thelegendsgolfclub/teetimes/thelegendsgolfclub',
  maxAdvanceDays: 5,
  releaseTime: '06:00',
  // Intentionally empty: TeeOn's guest feed carries no price and the per-slot
  // variant resolution is unsolved, so pricing is deferred to a follow-up change.
  pricing: {
    rules: [],
  },
  facilityId: 477,
};
