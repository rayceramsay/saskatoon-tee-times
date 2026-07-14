import { z } from 'zod';
import type { GroupSize } from '@stt/tee-time-domain/primitives-schema';

const MAX_GROUP_SIZE = 4;

/**
 * A single TeeOn per-size booking rule, as served by `settings/tee-sheet`.
 *
 * The enum rejects any value outside the recognized set, so an unseen rule fails
 * loudly against the committed fixture rather than silently mis-deriving
 * availability. `allow` — always bookable; `allow_within_group` — bookable only
 * when a group already exists to join; `disallow` — never bookable.
 */
const BookingSizeRule = z.enum(['allow', 'allow_within_group', 'disallow']);
type BookingSizeRule = z.infer<typeof BookingSizeRule>;

/**
 * The four per-size booking rules on a TeeOn `settings/tee-sheet` response.
 *
 * Extra fields are ignored; the four consumed rule fields must each be a
 * recognized {@link BookingSizeRule}.
 */
const TeeSheetSettings = z.object({
  single_bookings: BookingSizeRule,
  twosome_bookings: BookingSizeRule,
  threesome_bookings: BookingSizeRule,
  foursome_bookings: BookingSizeRule,
});

/**
 * The facility's per-size booking rules, deciding which group sizes a start may
 * be booked at.
 *
 * A pure value object: the same interpretation applies regardless of where the
 * rule values came from, so it holds no I/O. TeeOn gates each size with one of
 * `allow` / `allow_within_group` / `disallow`; `allow_within_group` means a solo
 * player may only join a partially-filled group, never start one on an empty
 * start — which is why an empty size-4 start is "2 - 4 Players", not "1 - 4".
 */
export class TeeOnBookingSizeRules {
  private constructor(
    private readonly ruleBySize: Readonly<Record<GroupSize, BookingSizeRule>>
  ) {}

  /**
   * Parse a captured `settings/tee-sheet` response into booking rules.
   *
   * @param settings - The decoded JSON body of a `guest/facility/settings/tee-sheet` response.
   * @returns The parsed rules, throwing if any consumed rule value is unrecognized.
   */
  static fromSettings(settings: unknown): TeeOnBookingSizeRules {
    const parsed = TeeSheetSettings.parse(settings);
    return new TeeOnBookingSizeRules({
      1: parsed.single_bookings,
      2: parsed.twosome_bookings,
      3: parsed.threesome_bookings,
      4: parsed.foursome_bookings,
    });
  }

  /**
   * The group sizes bookable at a start, over the candidate range
   * `[1 .. min(quantityRemaining, 4)]`.
   *
   * A candidate size is retained only when its rule permits it given whether a
   * group already exists to join (`quantityRemaining < slotSize`). The result MAY
   * be non-contiguous when a middle size is disallowed.
   *
   * @param quantityRemaining - Slots still open at the start.
   * @param slotSize - The start's total open-slot capacity when empty.
   */
  bookableGroupSizes(quantityRemaining: number, slotSize: number): GroupSize[] {
    const groupExists = quantityRemaining < slotSize;
    const maxCandidate = Math.min(quantityRemaining, MAX_GROUP_SIZE);

    const sizes: GroupSize[] = [];
    for (let size = 1; size <= maxCandidate; size++) {
      const groupSize = size as GroupSize;
      if (isBookable(this.ruleBySize[groupSize], groupExists)) {
        sizes.push(groupSize);
      }
    }
    return sizes;
  }
}

function isBookable(rule: BookingSizeRule, groupExists: boolean): boolean {
  switch (rule) {
    case 'allow':
      return true;
    case 'allow_within_group':
      return groupExists;
    case 'disallow':
      return false;
  }
}
