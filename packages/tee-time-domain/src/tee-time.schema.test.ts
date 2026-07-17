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
    booking: {
      kind: 'reservation',
      urls: {
        2: 'https://www.chronogolf.ca/club/greenbryre?players=2',
        3: 'https://www.chronogolf.ca/club/greenbryre?players=3',
        4: 'https://www.chronogolf.ca/club/greenbryre?players=4',
      },
    },
    scrapedAt: '2026-07-07T18:00:00Z',
    dynamicPrice: 42.5,
  };

  it('parses a fully valid record', () => {
    const result = ScrapedTeeTime.parse(validRecord);

    expect(result.groupSizes).toEqual([2, 3, 4]);
    expect(result.dynamicPrice).toBe(42.5);
  });

  it('parses a reservation booking with a deep link per group size', () => {
    const result = ScrapedTeeTime.parse(validRecord);

    expect(result.booking).toEqual({
      kind: 'reservation',
      urls: {
        2: 'https://www.chronogolf.ca/club/greenbryre?players=2',
        3: 'https://www.chronogolf.ca/club/greenbryre?players=3',
        4: 'https://www.chronogolf.ca/club/greenbryre?players=4',
      },
    });
  });

  it('parses a portal booking carrying a single url', () => {
    const result = ScrapedTeeTime.parse({
      ...validRecord,
      booking: { kind: 'portal', url: 'https://legends.teeon.com/?date=2026-07-10' },
    });

    expect(result.booking).toEqual({
      kind: 'portal',
      url: 'https://legends.teeon.com/?date=2026-07-10',
    });
  });

  it('parses a phone booking carrying no url', () => {
    const result = ScrapedTeeTime.parse({ ...validRecord, booking: { kind: 'phone' } });

    expect(result.booking).toEqual({ kind: 'phone' });
  });

  it('strips a url smuggled onto the phone arm', () => {
    const result = ScrapedTeeTime.parse({
      ...validRecord,
      booking: { kind: 'phone', url: 'https://example.com/book' },
    });

    expect(result.booking).toEqual({ kind: 'phone' });
  });

  it('rejects a booking kind outside the three arms', () => {
    const result = ScrapedTeeTime.safeParse({
      ...validRecord,
      booking: { kind: 'walk-in', url: 'https://example.com/book' },
    });

    expect(result.success).toBe(false);
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
