import { z } from 'zod';

/**
 * Identifier for a course.
 *
 * @example
 * ```typescript
 * const courseId = CourseId.parse('the-legends');
 * ```
 */
export const CourseId = z.string();
export type CourseId = z.infer<typeof CourseId>;

/**
 * The closed set of third-party booking platforms that courses outsource to.
 *
 * Each value maps to a dedicated scraper implementation, so the enum is kept
 * closed to force a compile-time decision whenever a new platform is added.
 *
 * @example
 * ```typescript
 * const platformId = PlatformId.parse('chronogolf-v1');
 * ```
 */
export const PlatformId = z.enum([
  'chronogolf-v1',
  'chronogolf-v2',
  'webtrac',
  'teeon',
]);
export type PlatformId = z.infer<typeof PlatformId>;
