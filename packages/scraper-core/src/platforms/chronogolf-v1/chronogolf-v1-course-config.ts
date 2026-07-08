import type { CourseConfig } from '../../domain/course-config.base.js';

/**
 * A single bookable product within a Chronogolf V1 course.
 *
 * A course fans out over one or more listings — distinct combinations of
 * Chronogolf sub-course, hole count, and routing — that are each queried
 * separately and merged into the course's tee times.
 */
export interface ChronogolfV1Listing {
  // Chronogolf's own course_id for this listing (a course may expose several).
  chronogolfCourseId: number;
  // Hole count for the listing; sourced into ScrapedTeeTime.holes.
  nbHoles: number;
  // Ordered set names played, e.g. ["North"]; [] when unknown.
  routing: string[];
}

/**
 * Configuration for a course booked through Chronogolf V1.
 *
 * Extends the universal {@link CourseConfig} with the platform mechanics
 * needed to address Chronogolf's V1 API for this course.
 */
export interface ChronogolfV1CourseConfig extends CourseConfig {
  // TLD of the Chronogolf mirror to query, e.g. "ca" or "com" — pins the origin.
  tld: string;
  // Chronogolf club id owning the course.
  clubId: number;
  // Affiliation type id repeated once per player in each request.
  affiliationTypeId: number;
  // The listings this course fans out over.
  listings: ChronogolfV1Listing[];
}
