import type { CoursePricingConfig } from '../../../domain/pricing-engine.js';
import type { TeeOnCourseConfig } from '../teeon-course-config.js';

/**
 * TeeOn booking configuration for The Legends Golf Club (Warman).
 *
 * A single scrape drives this portal URL for the target date and captures the
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
  facilityId: 477,
  portalUrl:
    'https://admin.teeon.com/portal/thelegendsgolfclub/teetimes/thelegendsgolfclub',
};

/**
 * Pricing configuration for The Legends.
 *
 * Intentionally empty: TeeOn's guest feed carries no price and the per-slot
 * variant resolution is unsolved, so pricing is deferred to a follow-up
 * change.
 */
export const theLegendsPricingConfig: CoursePricingConfig = {
  rules: [],
};
