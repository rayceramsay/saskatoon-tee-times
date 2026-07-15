import { describe, expect, it } from 'vitest';
import { bookingUrlFor, freshnessState } from './derived.util';
import { makeTeeTime } from './test-support/make-tee-time';

const NOW = new Date('2026-07-13T14:00:00Z');

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe('freshnessState', () => {
  it('reports fresh under 20 minutes', () => {
    expect(freshnessState(minutesAgo(3), NOW)).toEqual({
      level: 'fresh',
      label: 'Updated 3 min ago',
    });
  });

  it('reports amber between 20 minutes and an hour', () => {
    expect(freshnessState(minutesAgo(30), NOW)).toEqual({
      level: 'amber',
      label: 'Updated 30 min ago',
    });
  });

  it('reports red beyond an hour with an hour-based label', () => {
    expect(freshnessState(minutesAgo(90), NOW)).toEqual({
      level: 'red',
      label: 'Updated 1 hr ago',
    });
  });

  it('reports a dash when there is no timestamp', () => {
    expect(freshnessState(null, NOW)).toEqual({ level: 'none', label: '—' });
  });
});

describe('bookingUrlFor', () => {
  it('targets the selected player count', () => {
    const slot = makeTeeTime({
      groupSizes: [1, 2, 3, 4],
      bookingUrls: { 2: 'https://book/2', 4: 'https://book/4' },
    });

    expect(bookingUrlFor(slot, 2)).toBe('https://book/2');
  });

  it('targets the maximum group size when Players is Any', () => {
    const slot = makeTeeTime({
      groupSizes: [1, 2, 3, 4],
      bookingUrls: { 2: 'https://book/2', 4: 'https://book/4' },
    });

    expect(bookingUrlFor(slot, null)).toBe('https://book/4');
  });

  it('falls back to the maximum size when the selected size has no URL', () => {
    const slot = makeTeeTime({
      groupSizes: [2, 3, 4],
      bookingUrls: { 4: 'https://book/4' },
    });

    expect(bookingUrlFor(slot, 2)).toBe('https://book/4');
  });
});
