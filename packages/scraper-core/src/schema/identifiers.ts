import { z } from 'zod';

/** Identifier for a course */
export const CourseId = z.string();
export type CourseId = z.infer<typeof CourseId>;

/** The closed set of third-party booking platforms that courses outsource to. */
export const PlatformId = z.enum([
  'chronogolf-v1',
  'chronogolf-v2',
  'webtrac',
  'teeon',
]);
export type PlatformId = z.infer<typeof PlatformId>;
