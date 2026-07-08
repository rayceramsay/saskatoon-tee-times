import { describe, expect, it } from 'vitest';
import type { ScrapedTeeTime } from './tee-time.schema.js';
import { toTeeTime } from './tee-time.mapper.js';

const scraped: ScrapedTeeTime = {
  startInstant: '2026-07-10T06:00:00-06:00',
  courseId: 'greenbryre',
  courseName: 'Greenbryre',
  holes: 12,
  routing: ['North'],
  groupSizes: [2, 3, 4],
  bookingUrls: {
    2: 'https://www.chronogolf.ca/club/greenbryre',
    4: 'https://www.chronogolf.ca/club/greenbryre',
  },
  scrapedAt: '2026-07-07T18:00:00Z',
  dynamicPrice: 42.5,
};

describe('toTeeTime', () => {
  it('maps dynamicPrice to pricePerPlayer', () => {
    const teeTime = toTeeTime(scraped);

    expect(teeTime.pricePerPlayer).toBe(42.5);
  });

  it('preserves a null price as null', () => {
    const teeTime = toTeeTime({ ...scraped, dynamicPrice: null });

    expect(teeTime.pricePerPlayer).toBeNull();
  });

  it('carries every shared field through unchanged', () => {
    const teeTime = toTeeTime(scraped);

    expect(teeTime).toEqual({
      startInstant: scraped.startInstant,
      courseId: scraped.courseId,
      courseName: scraped.courseName,
      holes: scraped.holes,
      routing: scraped.routing,
      groupSizes: scraped.groupSizes,
      bookingUrls: scraped.bookingUrls,
      scrapedAt: scraped.scrapedAt,
      pricePerPlayer: 42.5,
    });
  });

  it('does not carry the raw dynamicPrice field onto the result', () => {
    const teeTime = toTeeTime(scraped);

    expect('dynamicPrice' in teeTime).toBe(false);
  });
});
