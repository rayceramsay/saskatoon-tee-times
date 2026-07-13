import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GroupSize } from '@stt/tee-time-domain/primitives-schema';
import type { ScrapedTeeTime } from '@stt/tee-time-domain/tee-time-schema';
import type { JsonFetcher } from '../../transport/json-fetcher.port.js';
import { ChronogolfV1Scraper } from './chronogolf-v1-scraper.adapter.js';
import type { ChronogolfV1CourseConfig } from './chronogolf-v1-course-config.js';

const DATE = '2026-07-11';
const fixturesDir = new URL('./__fixtures__/', import.meta.url);

function loadFixture(nbHoles: number, players: number): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`greenbryre-2020-${nbHoles}h-${players}p.json`, fixturesDir),
      'utf-8'
    )
  );
}

// Serves the committed fixtures by reading nb_holes and the party size (the
// number of repeated affiliation params) out of the requested URL.
const fixtureFetcher: JsonFetcher = {
  fetchJson(url: string): Promise<unknown> {
    const parsed = new URL(url);
    const nbHoles = Number(parsed.searchParams.get('nb_holes'));
    const players = parsed.searchParams.getAll('affiliation_type_ids[]').length;
    return Promise.resolve(loadFixture(nbHoles, players));
  },
};

// Only the two main-course listings, which have committed fixtures. The scrape
// `tld` (com) deliberately differs from the user-facing `bookingTld` (ca) so the
// deep-link tests can prove the scrape mirror never leaks into booking URLs.
const testConfig: ChronogolfV1CourseConfig = {
  courseId: 'greenbryre',
  courseName: 'Greenbryre',
  timeZone: 'America/Regina',
  bookingPortalUrl: 'https://greenbryre.com/book-a-tee-time/',
  maxAdvanceDays: 7,
  releaseTime: '06:00',
  tld: 'com',
  bookingTld: 'ca',
  slug: 'greenbryre-country-club-closed-until-2013-season',
  clubId: 1743,
  affiliationTypeId: 7689,
  listings: [
    { chronogolfCourseId: 2020, nbHoles: 12, routing: [] },
    { chronogolfCourseId: 2020, nbHoles: 6, routing: [] },
  ],
};

describe('ChronogolfV1Scraper', () => {
  it('exposes its platform and courses', () => {
    const scraper = new ChronogolfV1Scraper([testConfig], fixtureFetcher);

    expect(scraper.platform).toBe('chronogolf-v1');
    expect(scraper.courses).toHaveLength(1);
  });

  it('fans out over listings and concatenates the merged results', async () => {
    const scraper = new ChronogolfV1Scraper([testConfig], fixtureFetcher);

    const teeTimes = await scraper.scrape('greenbryre', DATE);

    const holeCounts = new Set(teeTimes.map((teeTime) => teeTime.holes));
    expect(holeCounts).toEqual(new Set([12, 6]));
    expect(teeTimes.every((teeTime) => teeTime.groupSizes.length > 0)).toBe(true);
    expect(teeTimes.length).toBeGreaterThan(0);
  });

  it('throws for a course it does not serve', async () => {
    const scraper = new ChronogolfV1Scraper([testConfig], fixtureFetcher);

    await expect(scraper.scrape('unknown-course', DATE)).rejects.toThrow(
      /unknown course/
    );
  });

  it('rejects a response whose shape no longer matches', async () => {
    const brokenFetcher: JsonFetcher = {
      fetchJson: () => Promise.resolve([{ id: 'not-a-number' }]),
    };
    const scraper = new ChronogolfV1Scraper([testConfig], brokenFetcher);

    await expect(scraper.scrape('greenbryre', DATE)).rejects.toThrow();
  });
});

describe('ChronogolfV1Scraper merge behaviour (through scrape)', () => {
  let teeTimes: ScrapedTeeTime[];

  beforeAll(async () => {
    const scraper = new ChronogolfV1Scraper([testConfig], fixtureFetcher);
    teeTimes = await scraper.scrape('greenbryre', DATE);
  });

  it('stamps holes and routing from the listing, not the response', () => {
    expect(teeTimes.length).toBeGreaterThan(0);
    expect(new Set(teeTimes.map((teeTime) => teeTime.holes))).toEqual(new Set([12, 6]));
    for (const teeTime of teeTimes) {
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
    for (const players of [1, 2, 3, 4]) {
      const slots = loadFixture(12, players) as {
        id: number;
        out_of_capacity: boolean;
        restrictions: string[];
      }[];
      for (const slot of slots) {
        allIds.add(slot.id);
        if (!slot.out_of_capacity && slot.restrictions.length === 0) {
          bookableIds.add(slot.id);
        }
      }
    }

    const twelveHoleTeeTimes = teeTimes.filter((teeTime) => teeTime.holes === 12);
    expect(bookableIds.size).toBeLessThan(allIds.size);
    expect(twelveHoleTeeTimes).toHaveLength(bookableIds.size);
  });

  it('maps every valid group size to a slot-and-size-specific deep link', () => {
    for (const teeTime of teeTimes) {
      const urlSizes = Object.keys(teeTime.bookingUrls)
        .map(Number)
        .sort((a, b) => a - b);
      expect(urlSizes).toEqual(teeTime.groupSizes);

      const date = teeTime.startInstant.slice(0, 10);
      for (const groupSize of teeTime.groupSizes) {
        const url = teeTime.bookingUrls[groupSize] ?? '';
        const fragment = new URL(url).hash;
        const params = new URLSearchParams(fragment.slice(fragment.indexOf('?') + 1));

        expect(url).toContain(`/club/${testConfig.slug}/booking/`);
        expect(params.get('teetime_id')).toBeTruthy();
        expect(params.get('course_id')).toBe(String(2020));
        expect(params.get('nb_holes')).toBe(String(teeTime.holes));
        expect(params.get('date')).toBe(date);

        const affiliationIds = params.get('affiliation_type_ids')?.split(',') ?? [];
        expect(affiliationIds).toHaveLength(groupSize);
        expect(
          affiliationIds.every((id) => id === String(testConfig.affiliationTypeId))
        ).toBe(true);
      }
    }
  });

  it('builds deep links on the canonical booking host, never the scrape mirror', () => {
    for (const teeTime of teeTimes) {
      for (const url of Object.values(teeTime.bookingUrls)) {
        expect(url).toContain(`https://www.chronogolf.${testConfig.bookingTld}/`);
        expect(url).not.toContain(`chronogolf.${testConfig.tld}`);
      }
    }
  });

  it('captures a raw dynamicPrice from a bookable query', () => {
    const priced = teeTimes.filter((teeTime) => teeTime.dynamicPrice !== null);

    expect(priced.length).toBeGreaterThan(0);
    expect(typeof priced[0]?.dynamicPrice).toBe('number');
  });

  it('yields a null dynamicPrice when no bookable query conveyed a price', async () => {
    // A single bookable slot, exposed only to the 2-player query and carrying no
    // green fees, so the merged tee time is bookable at size 2 with no price.
    const pricelessFetcher: JsonFetcher = {
      fetchJson(url: string): Promise<unknown> {
        const players = new URL(url).searchParams.getAll(
          'affiliation_type_ids[]'
        ).length;
        const slots =
          players === 2
            ? [
                {
                  id: 1,
                  start_time: '07:00',
                  date: DATE,
                  hole: 1,
                  restrictions: [] as string[],
                  out_of_capacity: false,
                },
              ]
            : [];
        return Promise.resolve(slots);
      },
    };
    const singleListingConfig: ChronogolfV1CourseConfig = {
      ...testConfig,
      listings: [{ chronogolfCourseId: 2020, nbHoles: 12, routing: [] }],
    };
    const scraper = new ChronogolfV1Scraper([singleListingConfig], pricelessFetcher);

    const [teeTime] = await scraper.scrape('greenbryre', DATE);

    expect(teeTime?.groupSizes).toEqual<GroupSize[]>([2]);
    expect(teeTime?.dynamicPrice).toBeNull();
    expect(teeTime?.startInstant).toBe('2026-07-11T07:00:00-06:00');
  });
});
