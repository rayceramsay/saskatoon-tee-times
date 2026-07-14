import type { CourseConfig } from '@stt/tee-time-domain/course-config';

/**
 * Configuration for a course booked through the TeeOn platform.
 *
 * Extends the universal {@link CourseConfig} with the TeeOn `facilityId` that
 * keys the guest availability feed and the public `portalUrl` — driven both to
 * capture that session-gated feed and to build booking links.
 */
export interface TeeOnCourseConfig extends CourseConfig {
  // TeeOn facility id identifying this course's guest availability feed.
  facilityId: number;
  // Public portal URL, driven with the target date to capture the guest feed
  // and reused (with the date applied) as the booking link.
  portalUrl: string;
}
