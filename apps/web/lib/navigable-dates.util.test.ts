import { describe, expect, it } from 'vitest';
import {
  furthestNavigableDate,
  isNavigable,
  navigableDates,
} from './navigable-dates.util';

const TODAY = '2026-07-13';

describe('navigable date set', () => {
  it('spans today through today + 7 inclusive', () => {
    const dates = navigableDates(TODAY, 7);

    expect(dates).toHaveLength(8);
    expect(dates[0]).toBe('2026-07-13');
    expect(dates.at(-1)).toBe('2026-07-20');
  });

  it('crosses month boundaries correctly', () => {
    expect(navigableDates('2026-07-30', 7).at(-1)).toBe('2026-08-06');
  });

  it('places the furthest navigable date at today + 7', () => {
    expect(furthestNavigableDate(TODAY, 7)).toBe('2026-07-20');
  });

  it('excludes past dates and dates beyond the window', () => {
    expect(isNavigable('2026-07-12', TODAY, 7)).toBe(false);
    expect(isNavigable('2026-07-13', TODAY, 7)).toBe(true);
    expect(isNavigable('2026-07-20', TODAY, 7)).toBe(true);
    expect(isNavigable('2026-07-21', TODAY, 7)).toBe(false);
  });
});
