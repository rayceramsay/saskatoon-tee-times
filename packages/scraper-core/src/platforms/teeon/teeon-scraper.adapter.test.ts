import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ScrapedTeeTime } from '@stt/tee-time-domain/tee-time-schema';
import type { CapturedJsonFetcher } from '../../transport/captured-json-fetcher.port.js';
import { TeeOnScraper } from './teeon-scraper.adapter.js';
import type { TeeOnCourseConfig } from './teeon-course-config.js';

const DATE = '2026-07-17';
const PORTAL_URL =
  'https://admin.teeon.com/portal/thelegendsgolfclub/teetimes/thelegendsgolfclub';
const PORTAL_WITH_DATE = `${PORTAL_URL}?date=${DATE}`;

function loadFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf-8')
  );
}

const fixture = loadFixture(`the-legends-${DATE}.json`);
const settingsFixture = loadFixture('the-legends-settings-tee-sheet.json');

// A fetcher that resolves the two captured targets from committed fixtures; the
// scrape reads its `teeTime` and `settings` bodies from the returned map.
function fixtureFetcher(
  teeTime: unknown = fixture,
  settings: unknown = settingsFixture
): CapturedJsonFetcher {
  return { capture: () => Promise.resolve({ teeTime, settings }) };
}

const testConfig: TeeOnCourseConfig = {
  courseId: 'the-legends',
  courseName: 'The Legends',
  timeZone: 'America/Regina',
  bookingPortalUrl: PORTAL_URL,
  maxAdvanceDays: 5,
  releaseTime: '06:00',
  facilityId: 477,
  portalUrl: PORTAL_URL,
};

// A minimal raw guest row carrying only the consumed fields; the schema strips
// the rest, so tests override just what a scenario needs.
function rawRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    start_time: '07:00',
    date: DATE,
    quantity_remaining: 2,
    size: 4,
    division_title: 'Front',
    turn_division_title: 'Back',
    turn_tee_time: null,
    blocked_type: 'open',
    ...overrides,
  };
}

describe('TeeOnScraper', () => {
  it('exposes its platform and courses', () => {
    const scraper = new TeeOnScraper([testConfig], fixtureFetcher());

    expect(scraper.platform).toBe('teeon');
    expect(scraper.courses).toHaveLength(1);
  });

  it('throws for a course it does not serve', async () => {
    const scraper = new TeeOnScraper([testConfig], fixtureFetcher());

    await expect(scraper.scrape('unknown-course', DATE)).rejects.toThrow(
      /unknown course/
    );
  });

  it('drives the portal page once, capturing tee-time and settings by prefix', async () => {
    const calls: { pageUrl: string; targets: Record<string, string> }[] = [];
    const spyFetcher: CapturedJsonFetcher = {
      capture: (pageUrl, targets) => {
        calls.push({ pageUrl, targets });
        return Promise.resolve({ teeTime: fixture, settings: settingsFixture });
      },
    };
    const scraper = new TeeOnScraper([testConfig], spyFetcher);

    await scraper.scrape('the-legends', DATE);

    expect(calls).toEqual([
      {
        pageUrl: PORTAL_WITH_DATE,
        targets: {
          teeTime:
            'https://admin.teeon.com/api/2024-04/guest/tee-time?facility_id=477&date=2026-07-17',
          settings:
            'https://admin.teeon.com/api/2024-04/guest/facility/settings/tee-sheet?facility_id=477',
        },
      },
    ]);
  });

  it('rejects a tee-time response whose shape no longer matches', async () => {
    const scraper = new TeeOnScraper([testConfig], fixtureFetcher([{ start_time: 5 }]));

    await expect(scraper.scrape('the-legends', DATE)).rejects.toThrow();
  });

  it('rejects a settings response carrying an unrecognized rule value', async () => {
    const brokenSettings = {
      ...(settingsFixture as object),
      single_bookings: 'sometimes',
    };
    const scraper = new TeeOnScraper(
      [testConfig],
      fixtureFetcher(fixture, brokenSettings)
    );

    await expect(scraper.scrape('the-legends', DATE)).rejects.toThrow();
  });

  it('drops blocked and full starts', async () => {
    const scraper = new TeeOnScraper(
      [testConfig],
      fixtureFetcher([
        rawRow({ start_time: '06:00', blocked_type: 'crossover' }),
        rawRow({ start_time: '06:30', quantity_remaining: 0 }),
        rawRow({ start_time: '08:00' }),
      ])
    );

    const teeTimes = await scraper.scrape('the-legends', DATE);

    expect(teeTimes).toHaveLength(1);
    expect(teeTimes[0]?.startInstant).toBe('2026-07-17T08:00:00-06:00');
  });
});

describe('TeeOnScraper fan-out (through scrape)', () => {
  let teeTimes: ScrapedTeeTime[];

  beforeAll(async () => {
    const scraper = new TeeOnScraper([testConfig], fixtureFetcher());
    teeTimes = await scraper.scrape('the-legends', DATE);
  });

  it('fans each continuation start into a 9- and 18-hole record', () => {
    // The fixture has 5 starts carrying an 18-hole continuation and 4 late-day
    // starts without one: 5 * 2 + 4 = 14 records, of which 5 are 18-hole.
    expect(teeTimes).toHaveLength(14);
    expect(teeTimes.filter((teeTime) => teeTime.holes === 9)).toHaveLength(9);
    expect(teeTimes.filter((teeTime) => teeTime.holes === 18)).toHaveLength(5);
  });

  it('routes 9-hole records to the front nine and 18-hole to front then back', () => {
    for (const teeTime of teeTimes) {
      if (teeTime.holes === 9) {
        expect(teeTime.routing).toEqual(['Front']);
      } else {
        expect(teeTime.routing).toEqual(['Front', 'Back']);
      }
    }
  });

  it('yields only a 9-hole record for a late-day start without a continuation', () => {
    const lateStart = teeTimes.filter((teeTime) =>
      teeTime.startInstant.startsWith('2026-07-17T18:56')
    );

    expect(lateStart).toHaveLength(1);
    expect(lateStart[0]?.holes).toBe(9);
  });

  it('stamps startInstant with the course local offset', () => {
    for (const teeTime of teeTimes) {
      expect(teeTime.startInstant).toMatch(/^2026-07-17T\d{2}:\d{2}:00-06:00$/);
    }
  });

  it('derives group sizes from the facility booking-size rules', () => {
    // single_bookings is allow_within_group, so an empty start excludes size 1.
    // The 18:56 start is empty (quantity_remaining 4 == size 4).
    const emptyStart = teeTimes.find((teeTime) =>
      teeTime.startInstant.startsWith('2026-07-17T18:56')
    );
    // The 13:28 start is partially filled (quantity_remaining 1 < size 4).
    const joinableSingle = teeTimes.find((teeTime) =>
      teeTime.startInstant.startsWith('2026-07-17T13:28')
    );

    expect(emptyStart?.groupSizes).toEqual([2, 3, 4]);
    expect(joinableSingle?.groupSizes).toEqual([1]);
  });

  it('is always online-bookable with no scraped price', () => {
    for (const teeTime of teeTimes) {
      expect(teeTime.onlineBookable).toBe(true);
      expect(teeTime.dynamicPrice).toBeNull();
    }
  });

  it('maps every group size to the shared portal-with-date booking URL', () => {
    for (const teeTime of teeTimes) {
      const urlSizes = Object.keys(teeTime.bookingUrls)
        .map(Number)
        .sort((a, b) => a - b);
      expect(urlSizes).toEqual(teeTime.groupSizes);

      for (const url of Object.values(teeTime.bookingUrls)) {
        expect(url).toBe(PORTAL_WITH_DATE);
      }
    }
  });
});

describe('TeeOnScraper restricted single bookings (2026-07-15)', () => {
  const RESTRICTED_DATE = '2026-07-15';
  const restrictedFixture = loadFixture(`the-legends-${RESTRICTED_DATE}.json`);
  let teeTimes: ScrapedTeeTime[];

  beforeAll(async () => {
    const scraper = new TeeOnScraper(
      [testConfig],
      fixtureFetcher(restrictedFixture, settingsFixture)
    );
    teeTimes = await scraper.scrape('the-legends', RESTRICTED_DATE);
  });

  it('lifts the single-booking floor to 2 on the empty 14:48 start', () => {
    const emptyStart = teeTimes.filter((teeTime) =>
      teeTime.startInstant.startsWith(`${RESTRICTED_DATE}T14:48`)
    );

    expect(emptyStart.length).toBeGreaterThan(0);
    for (const teeTime of emptyStart) {
      expect(teeTime.groupSizes).toEqual([2, 3, 4]);
    }
  });

  it('allows a single booking on the partially-filled 12:00 start', () => {
    const joinableStart = teeTimes.filter((teeTime) =>
      teeTime.startInstant.startsWith(`${RESTRICTED_DATE}T12:00`)
    );

    expect(joinableStart.length).toBeGreaterThan(0);
    for (const teeTime of joinableStart) {
      expect(teeTime.groupSizes).toEqual([1]);
    }
  });
});
