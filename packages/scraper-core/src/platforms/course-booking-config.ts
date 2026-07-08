import type { CourseId } from '../schema/identifiers.js';

/**
 * Universal booking facts about a course, independent of the platform that books it.
 *
 * Every platform's course config extends this base shape.
 */
export interface CourseBookingConfig {
  courseId: CourseId;
  // Human readable display name for the course.
  courseName: string;
  // IANA time zone id (e.g. "America/Regina") the course's geographical region is in.
  timeZone: string;
  // General booking portal URL for the course.
  bookingPortalUrl: string;
}
