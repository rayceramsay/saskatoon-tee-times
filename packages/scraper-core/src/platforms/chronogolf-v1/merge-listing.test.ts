import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GroupSize } from '../../schema/group-size.js';
import type { ChronogolfV1Listing } from './chronogolf-v1-config.js';
import { greenbryreConfig } from './courses/greenbryre.js';
import { mergeListing } from './merge-listing.js';
import { parseResponse, type RawChronogolfV1TeeTime } from './parse-response.js';

// Note: The data below needs to match the data used to create the fixtures
const DATE = '2026-07-11';
const GROUP_SIZES: readonly GroupSize[] = [1, 2, 3, 4];
const mainListing: ChronogolfV1Listing = {
  chronogolfCourseId: 2020,
  nbHoles: 12,
  routing: [],
};

const fixturesDir = new URL('./__fixtures__/', import.meta.url);

function loadResponsesByGroupSize(
  nbHoles: number
): Map<GroupSize, RawChronogolfV1TeeTime[]> {
  return new Map(
    GROUP_SIZES.map((groupSize) => {
      const json = readFileSync(
        new URL(`greenbryre-2020-${nbHoles}h-${groupSize}p.json`, fixturesDir),
        'utf-8'
      );
      return [groupSize, parseResponse(JSON.parse(json))];
    })
  );
}

describe('mergeListing', () => {
  const responsesByGroupSize = loadResponsesByGroupSize(12);
  const teeTimes = mergeListing(
    mainListing,
    responsesByGroupSize,
    greenbryreConfig,
    DATE
  );

  it('stamps holes and routing from the listing, not the response', () => {
    expect(teeTimes.length).toBeGreaterThan(0);
    for (const teeTime of teeTimes) {
      expect(teeTime.holes).toBe(12);
      expect(teeTime.routing).toEqual([]);
    }
  });

  it('stamps startInstant with the course local offset', () => {
    for (const teeTime of teeTimes) {
      expect(teeTime.startInstant).toMatch(/^2026-07-11T\d{2}:\d{2}:00-06:00$/);
    }
  });

  it('resolves non-contiguous group sizes for single-restricted empty tees', () => {
    // Single players are barred from booking a fully empty tee, so an otherwise
    // open slot is bookable at 2, 3, 4 but not 1.
    const nonContiguous = teeTimes.filter(
      (teeTime) => teeTime.groupSizes.join(',') === '2,3,4'
    );

    expect(nonContiguous.length).toBeGreaterThan(0);
  });

  it('emits every slot with ascending, non-empty group sizes', () => {
    for (const teeTime of teeTimes) {
      expect(teeTime.groupSizes.length).toBeGreaterThan(0);
      const ascending = [...teeTime.groupSizes].sort((a, b) => a - b);
      expect(teeTime.groupSizes).toEqual(ascending);
    }
  });

  it('drops slots bookable at no group size', () => {
    const allIds = new Set<number>();
    const bookableIds = new Set<number>();
    for (const [, slots] of responsesByGroupSize) {
      for (const slot of slots) {
        allIds.add(slot.id);
        if (!slot.out_of_capacity && slot.restrictions.length === 0) {
          bookableIds.add(slot.id);
        }
      }
    }

    expect(bookableIds.size).toBeLessThan(allIds.size);
    expect(teeTimes).toHaveLength(bookableIds.size);
  });

  it('maps every valid group size to the portal booking url', () => {
    for (const teeTime of teeTimes) {
      const urlSizes = Object.keys(teeTime.bookingUrls)
        .map(Number)
        .sort((a, b) => a - b);
      expect(urlSizes).toEqual(teeTime.groupSizes);

      for (const groupSize of teeTime.groupSizes) {
        expect(teeTime.bookingUrls[groupSize]).toBe(greenbryreConfig.bookingPortalUrl);
      }
    }
  });

  it('captures a raw dynamicPrice from a bookable query', () => {
    const priced = teeTimes.filter((teeTime) => teeTime.dynamicPrice !== null);

    expect(priced.length).toBeGreaterThan(0);
    expect(typeof priced[0]?.dynamicPrice).toBe('number');
  });

  it('yields a null dynamicPrice when no bookable query conveyed a price', () => {
    const priceless: RawChronogolfV1TeeTime = {
      id: 1,
      start_time: '07:00',
      date: DATE,
      hole: 1,
      restrictions: [],
      out_of_capacity: false,
    };
    const responses = new Map<GroupSize, RawChronogolfV1TeeTime[]>([[2, [priceless]]]);

    const [teeTime] = mergeListing(mainListing, responses, greenbryreConfig, DATE);

    expect(teeTime?.groupSizes).toEqual([2]);
    expect(teeTime?.dynamicPrice).toBeNull();
    expect(teeTime?.startInstant).toBe('2026-07-11T07:00:00-06:00');
  });
});
