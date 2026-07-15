import { describe, expect, it } from 'vitest';
import { isPast, startLocalTime, todayInCourseTz } from './course-local-time.util';

describe('todayInCourseTz', () => {
  it('resolves the course-local day, not the visitor UTC day', () => {
    // 04:00 UTC on Jul 14 is still 22:00 on Jul 13 in America/Regina (−06:00).
    const now = new Date('2026-07-14T04:00:00Z');

    expect(todayInCourseTz(now)).toBe('2026-07-13');
  });
});

describe('isPast', () => {
  const now = new Date('2026-07-13T13:00:00Z');

  it('is true for an instant before now', () => {
    expect(isPast('2026-07-13T06:30:00-06:00', now)).toBe(true);
  });

  it('is false for an instant after now', () => {
    expect(isPast('2026-07-13T08:00:00-06:00', now)).toBe(false);
  });
});

describe('startLocalTime', () => {
  it('reads the course-local wall clock from the offset-carrying instant', () => {
    expect(startLocalTime('2026-07-13T08:05:00-06:00')).toBe('08:05');
  });
});
