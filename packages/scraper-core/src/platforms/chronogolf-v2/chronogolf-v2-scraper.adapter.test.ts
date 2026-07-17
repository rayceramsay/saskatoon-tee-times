import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GroupSize } from '@stt/tee-time-domain/primitives-schema';
import type { ScrapedTeeTime } from '@stt/tee-time-domain/tee-time-schema';
import type { JsonFetcher } from '../../transport/json-fetcher.port.js';
import { ChronogolfV2Scraper } from './chronogolf-v2-scraper.adapter.js';
import type { ChronogolfV2CourseConfig } from './chronogolf-v2-course-config.js';

const DATE = '2026-07-17';
const fixturesDir = new URL('./__fixtures__/', import.meta.url);

function reservationUrls(
  teeTime: ScrapedTeeTime | undefined
): Partial<Record<GroupSize, string>> {
  expect(teeTime?.booking.kind).toBe('reservation');
  if (teeTime?.booking.kind !== 'reservation') throw new Error('unreachable');
  return teeTime.booking.urls;
}

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, fixturesDir), 'utf-8'));
}

// Serves the committed pages: page 1 is populated, every later page is the empty
// terminal page, so the scraper's stop condition is fixture-backed.
const fixtureFetcher: JsonFetcher = {
  fetchJson(url: string): Promise<unknown> {
    const page = Number(new URL(url).searchParams.get('page'));
    const file =
      page === 1
        ? 'the-willows-2026-07-17-page-1.json'
        : 'the-willows-2026-07-17-page-2-empty.json';
    return Promise.resolve(loadFixture(file));
  },
};

// The scrape `tld` (com) deliberately differs from the user-facing `bookingTld`
// (ca) so the deep-link tests can prove the scrape mirror never leaks into
// booking URLs. The affiliation matches the captured fixture
// (default_price.player_type_id 110161).
const testConfig: ChronogolfV2CourseConfig = {
  courseId: 'the-willows',
  courseName: 'The Willows',
  timeZone: 'America/Regina',
  bookingPortalUrl: 'https://thewillowsgolf.com/tee-times/',
  maxAdvanceDays: 5,
  releaseTime: '07:00',
  courseIds: [
    '25664982-9496-4843-8b9d-581b981d698c',
    '5fdf8123-a394-4533-aa03-ae11d9d60650',
    '2e7ff0bb-4cc8-4b85-85be-2a4f9a2813d0',
    '18',
  ],
  slug: 'the-willows-golf-country-club',
  affiliationTypeId: 110161,
  tld: 'com',
  bookingTld: 'ca',
};

describe('ChronogolfV2Scraper', () => {
  it('exposes its platform and courses', () => {
    const scraper = new ChronogolfV2Scraper([testConfig], fixtureFetcher);

    expect(scraper.platform).toBe('chronogolf-v2');
    expect(scraper.courses).toHaveLength(1);
  });

  it('throws for a course it does not serve', async () => {
    const scraper = new ChronogolfV2Scraper([testConfig], fixtureFetcher);

    await expect(scraper.scrape('unknown-course', DATE)).rejects.toThrow(
      /unknown course/
    );
  });

  it('rejects a response whose shape no longer matches', async () => {
    const brokenFetcher: JsonFetcher = {
      fetchJson: () => Promise.resolve({ teetimes: [{ id: 'not-a-number' }] }),
    };
    const scraper = new ChronogolfV2Scraper([testConfig], brokenFetcher);

    await expect(scraper.scrape('the-willows', DATE)).rejects.toThrow();
  });

  it('walks pages sequentially and stops at the first empty page', async () => {
    const requestedPages: number[] = [];
    const trackingFetcher: JsonFetcher = {
      fetchJson(url: string): Promise<unknown> {
        const page = Number(new URL(url).searchParams.get('page'));
        requestedPages.push(page);
        return fixtureFetcher.fetchJson(url);
      },
    };
    const scraper = new ChronogolfV2Scraper([testConfig], trackingFetcher);

    await scraper.scrape('the-willows', DATE);

    expect(requestedPages).toEqual([1, 2]);
  });
});

describe('ChronogolfV2Scraper parsing (through scrape)', () => {
  let teeTimes: ScrapedTeeTime[];

  beforeAll(async () => {
    const scraper = new ChronogolfV2Scraper([testConfig], fixtureFetcher);
    teeTimes = await scraper.scrape('the-willows', DATE);
  });

  it('fans each start out into a 9-hole and an 18-hole record', () => {
    // 15 populated starts × 2 hole counts.
    expect(teeTimes).toHaveLength(30);
    expect(new Set(teeTimes.map((teeTime) => teeTime.holes))).toEqual(new Set([9, 18]));
  });

  it('attributes records to the course config, with single-loop routing', () => {
    for (const teeTime of teeTimes) {
      expect(teeTime.courseId).toBe('the-willows');
      expect(teeTime.courseName).toBe('The Willows');
      expect(teeTime.routing).toHaveLength(1);
    }
    const loops = new Set(teeTimes.map((teeTime) => teeTime.routing[0]));
    expect(loops).toEqual(new Set(['Bridges', 'Lakes', 'Xena']));
  });

  it('stamps startInstant with the course local offset', () => {
    for (const teeTime of teeTimes) {
      expect(teeTime.startInstant).toMatch(/^2026-07-17T\d{2}:\d{2}:00-06:00$/);
    }
  });

  it('takes group sizes from the inline contiguous range', () => {
    const bySize = new Map(
      teeTimes.map((teeTime) => [teeTime.groupSizes.join(','), teeTime])
    );

    // The fixture carries {1,1}, {1,2}, {1,3}, and {1,4} spreads.
    expect(bySize.has('1')).toBe(true);
    expect(bySize.has('1,2')).toBe(true);
    expect(bySize.has('1,2,3')).toBe(true);
    expect(bySize.has('1,2,3,4')).toBe(true);
  });

  it('keeps same-time starts on different loops as distinct records', () => {
    const nineHoleAt1510 = teeTimes.filter(
      (teeTime) =>
        teeTime.holes === 9 && teeTime.startInstant === '2026-07-17T15:10:00-06:00'
    );

    expect(nineHoleAt1510).toHaveLength(2);
    expect(new Set(nineHoleAt1510.map((teeTime) => teeTime.routing[0]))).toEqual(
      new Set(['Bridges', 'Xena'])
    );
  });

  it('prices the 9-hole record and nulls the 18-hole record', () => {
    const bridges703 = teeTimes.filter(
      (teeTime) =>
        teeTime.routing[0] === 'Bridges' &&
        teeTime.startInstant === '2026-07-17T07:03:00-06:00'
    );
    const nineHole = bridges703.find((teeTime) => teeTime.holes === 9);
    const eighteenHole = bridges703.find((teeTime) => teeTime.holes === 18);

    expect(nineHole?.dynamicPrice).toBe(49.55);
    expect(eighteenHole?.dynamicPrice).toBeNull();
  });

  it('gives every record the reservation booking arm', () => {
    expect(teeTimes.every((teeTime) => teeTime.booking.kind === 'reservation')).toBe(
      true
    );
  });

  it('builds a per-size deep link repeating affiliation_type_ids per player', () => {
    const fourPlayer = teeTimes.find(
      (teeTime) => teeTime.groupSizes.join(',') === '1,2,3,4' && teeTime.holes === 9
    );
    expect(fourPlayer).toBeDefined();

    const urls = reservationUrls(fourPlayer);
    const urlSizes = Object.keys(urls)
      .map(Number)
      .sort((a, b) => a - b);
    expect(urlSizes).toEqual([1, 2, 3, 4]);

    for (const groupSize of fourPlayer?.groupSizes ?? []) {
      const url = urls[groupSize] ?? '';
      const fragment = url.slice(url.indexOf('#'));
      const params = new URLSearchParams(fragment.slice(fragment.indexOf('?') + 1));

      expect(url).toContain(`/club/${testConfig.slug}/booking/`);
      expect(params.get('teetime_id')).toBeTruthy();
      expect(params.get('nb_holes')).toBe('9');
      expect(params.get('engine')).toBe('2');

      const affiliationIds = params.get('affiliation_type_ids')?.split(',') ?? [];
      expect(affiliationIds).toHaveLength(groupSize);
      expect(
        affiliationIds.every((id) => id === String(testConfig.affiliationTypeId))
      ).toBe(true);
    }
  });

  it('builds deep links on the canonical booking host, never the scrape mirror', () => {
    for (const teeTime of teeTimes) {
      for (const url of Object.values(reservationUrls(teeTime))) {
        expect(url).toContain(`https://www.chronogolf.${testConfig.bookingTld}/`);
        expect(url).not.toContain(`chronogolf.${testConfig.tld}`);
      }
    }
  });
});
