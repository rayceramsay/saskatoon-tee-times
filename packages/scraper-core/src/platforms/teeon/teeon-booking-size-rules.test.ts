import { describe, expect, it } from 'vitest';
import { TeeOnBookingSizeRules } from './teeon-booking-size-rules.js';

const ALL_ALLOW = {
  single_bookings: 'allow',
  twosome_bookings: 'allow',
  threesome_bookings: 'allow',
  foursome_bookings: 'allow',
};

describe('BookingSizeRules', () => {
  it('rejects an unrecognized rule value', () => {
    expect(() =>
      TeeOnBookingSizeRules.fromSettings({ ...ALL_ALLOW, single_bookings: 'sometimes' })
    ).toThrow();
  });

  it('reproduces the contiguous range when every size is allowed', () => {
    const rules = TeeOnBookingSizeRules.fromSettings(ALL_ALLOW);

    expect(rules.bookableGroupSizes(4, 4)).toEqual([1, 2, 3, 4]);
    expect(rules.bookableGroupSizes(2, 4)).toEqual([1, 2]);
    expect(rules.bookableGroupSizes(1, 4)).toEqual([1]);
  });

  it('excludes the single size on an empty start when single_bookings is allow_within_group', () => {
    const rules = TeeOnBookingSizeRules.fromSettings({
      ...ALL_ALLOW,
      single_bookings: 'allow_within_group',
    });

    expect(rules.bookableGroupSizes(4, 4)).toEqual([2, 3, 4]);
  });

  it('includes the single size when a group already exists to join', () => {
    const rules = TeeOnBookingSizeRules.fromSettings({
      ...ALL_ALLOW,
      single_bookings: 'allow_within_group',
    });

    expect(rules.bookableGroupSizes(1, 4)).toEqual([1]);
  });

  it('excludes a disallowed size entirely', () => {
    const rules = TeeOnBookingSizeRules.fromSettings({
      ...ALL_ALLOW,
      single_bookings: 'disallow',
    });

    expect(rules.bookableGroupSizes(4, 4)).toEqual([2, 3, 4]);
    expect(rules.bookableGroupSizes(1, 4)).toEqual([]);
  });

  it('yields a non-contiguous result when a middle size is disallowed', () => {
    const rules = TeeOnBookingSizeRules.fromSettings({
      ...ALL_ALLOW,
      twosome_bookings: 'disallow',
    });

    expect(rules.bookableGroupSizes(4, 4)).toEqual([1, 3, 4]);
  });
});
