import { z } from 'zod';

/**
 * The only bookable party sizes across in-scope courses.
 *
 * Constrained to a closed union of 1 through 4 so that downstream records keyed
 * by group size stay exhaustive and type safe.
 *
 * @example
 * ```typescript
 * const size = GroupSize.parse(4);
 * ```
 */
export const GroupSize = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export type GroupSize = z.infer<typeof GroupSize>;

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
