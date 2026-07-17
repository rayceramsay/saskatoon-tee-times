import type { CourseConfig } from '@stt/tee-time-domain/course-config';

/**
 * Configuration for a course booked through the TeeOn platform.
 *
 * Extends the universal {@link CourseConfig} with the TeeOn `facilityId` that
 * keys the guest availability feed. The base `bookingPortalUrl` serves as both
 * the page driven to capture that session-gated feed and the emitted booking
 * link — for a TeeOn course they are the same page.
 */
export interface TeeOnCourseConfig extends CourseConfig {
  // TeeOn facility id identifying this course's guest availability feed.
  facilityId: number;
}
