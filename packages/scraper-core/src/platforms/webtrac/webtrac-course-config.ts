import type { CourseConfig } from '@stt/tee-time-domain/course-config';

/**
 * Configuration for a course booked through the WebTrac platform.
 *
 * Extends the universal {@link CourseConfig} with the WebTrac course selector
 * and the hole counts the course offers, which a single scrape fans out over.
 */
export interface WebtracCourseConfig extends CourseConfig {
  // WebTrac's `secondarycode` search selector identifying this course.
  secondaryCode: number;
  // Ordered hole counts offered; the scraper fetches one search page per count.
  holes: number[];
}
