import { z } from 'zod';

/** The only bookable party sizes across in-scope courses. */
export const GroupSize = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export type GroupSize = z.infer<typeof GroupSize>;
