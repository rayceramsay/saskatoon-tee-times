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
