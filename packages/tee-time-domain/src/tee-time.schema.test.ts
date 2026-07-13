import { describe, expect, it } from 'vitest';
import { ScrapedTeeTime } from './tee-time.schema.js';

describe('ScrapedTeeTime schema', () => {
  const validRecord = {
    startInstant: '2026-07-10T06:00:00-06:00',
    courseId: 'greenbryre',
    courseName: 'Greenbryre Golf & Country Club',
    holes: 12,
    routing: [],
    groupSizes: [2, 3, 4],
    bookingUrls: {
      2: 'https://www.chronogolf.ca/club/greenbryre',
      3: 'https://www.chronogolf.ca/club/greenbryre',
      4: 'https://www.chronogolf.ca/club/greenbryre',
    },
    onlineBookable: true,
    scrapedAt: '2026-07-07T18:00:00Z',
    dynamicPrice: 42.5,
  };

  it('parses a fully valid record', () => {
    const result = ScrapedTeeTime.parse(validRecord);

    expect(result.groupSizes).toEqual([2, 3, 4]);
    expect(result.dynamicPrice).toBe(42.5);
  });

  it('accepts a null dynamicPrice when the platform gave no price', () => {
    const result = ScrapedTeeTime.parse({ ...validRecord, dynamicPrice: null });

    expect(result.dynamicPrice).toBeNull();
  });

  it('rejects a group size outside the closed 1–4 union', () => {
    const result = ScrapedTeeTime.safeParse({
      ...validRecord,
      groupSizes: [5],
    });

    expect(result.success).toBe(false);
  });
});
