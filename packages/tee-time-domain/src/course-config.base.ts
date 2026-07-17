import type { CoursePricingConfig } from './course-pricing-config.js';
import type { CourseId } from './primitives.schema.js';

/**
 * Universal booking facts about a course, independent of the platform that books it.
 *
 * Every platform's course config extends this base shape.
 */
export interface CourseConfig {
  courseId: CourseId;
  // Human readable display name for the course.
  courseName: string;
  // IANA time zone id (e.g. "America/Regina") the course's geographical region is in.
  timeZone: string;
  // Where a golfer goes to book this course — which may be the course's own site
  // rather than the booking platform's (the platform is invisible to the golfer).
  // Holds the bare URL; adapters apply any date parameterization themselves.
  bookingPortalUrl: string;
  // Days ahead of today, inclusive, that are bookable (e.g. 7 means today through today + 7).
  maxAdvanceDays: number;
  // Local HH:MM wall-clock time at which the furthest-out date becomes bookable.
  releaseTime: string;
  // How the course's tee times are priced; every course produces tee times that must be priced.
  pricing: CoursePricingConfig;
}
