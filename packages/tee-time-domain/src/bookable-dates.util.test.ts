import { describe, expect, it } from 'vitest';
import type { CourseConfig } from './course-config.base.js';
import { bookableDates } from './bookable-dates.util.js';

// America/Regina is a fixed UTC-6 zone (no DST), so offsets in these instants are exact.
const reginaCourse: CourseConfig = {
  courseId: 'greenbryre',
  courseName: 'Greenbryre',
  timeZone: 'America/Regina',
  bookingPortalUrl: 'https://greenbryre.com/book-a-tee-time/',
  maxAdvanceDays: 7,
  releaseTime: '06:00',
  pricing: { rules: [] },
};

describe('bookableDates', () => {
  it('returns today through today plus maxAdvanceDays once past release time', () => {
    const now = new Date('2026-07-08T12:00:00-06:00');

    const dates = bookableDates(reginaCourse, now);

    expect(dates).toEqual([
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
    ]);
  });

  it('withholds the furthest-out date before release time', () => {
    const now = new Date('2026-07-08T05:00:00-06:00');

    const dates = bookableDates(reginaCourse, now);

    expect(dates.at(-1)).toBe('2026-07-14');
    expect(dates).not.toContain('2026-07-15');
    expect(dates).toHaveLength(7);
  });

  it('includes the furthest-out date exactly at release time', () => {
    const now = new Date('2026-07-08T06:00:00-06:00');

    const dates = bookableDates(reginaCourse, now);

    expect(dates.at(-1)).toBe('2026-07-15');
    expect(dates).toHaveLength(8);
  });

  it('anchors today to the course time zone across a UTC day rollover', () => {
    // 02:00 UTC on the 9th is still 20:00 on the 8th in Regina (UTC-6).
    const now = new Date('2026-07-09T02:00:00Z');

    const dates = bookableDates(reginaCourse, now);

    expect(dates[0]).toBe('2026-07-08');
    expect(dates).toHaveLength(8);
  });
});
