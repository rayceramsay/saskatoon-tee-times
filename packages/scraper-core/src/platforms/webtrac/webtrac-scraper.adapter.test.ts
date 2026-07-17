import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GroupSize } from '@stt/tee-time-domain/primitives-schema';
import type { ScrapedTeeTime } from '@stt/tee-time-domain/tee-time-schema';
import type { TextFetcher } from '../../transport/text-fetcher.port.js';
import { WebtracScraper } from './webtrac-scraper.adapter.js';
import type { WebtracCourseConfig } from './webtrac-course-config.js';

const fixturesDir = new URL('./__fixtures__/', import.meta.url);

function reservationUrls(
  teeTime: ScrapedTeeTime | undefined
): Partial<Record<GroupSize, string>> {
  expect(teeTime?.booking.kind).toBe('reservation');
  if (teeTime?.booking.kind !== 'reservation') throw new Error('unreachable');
  return teeTime.booking.urls;
}

// Maps the `secondarycode` search param back to the fixture's course slug.
const SLUG_BY_SECONDARY_CODE: Record<string, string> = {
  '1': 'holiday-park-championship',
  '2': 'holiday-park-executive-9',
  '3': 'silverwood',
  '4': 'wildwood',
};

// Serves committed fixtures by reading the course, date, and hole count out of
// the requested search URL, mirroring how the live endpoint is addressed.
const fixtureFetcher: TextFetcher = {
  fetchText(url: string): Promise<string> {
    const params = new URL(url).searchParams;
    const slug = SLUG_BY_SECONDARY_CODE[params.get('secondarycode') ?? ''];
    const holes = params.get('numberofholes');
    const [month, day, year] = (params.get('begindate') ?? '').split('/');
    const file = `${slug}-${year}-${month}-${day}-${holes}h.html`;
    return Promise.resolve(readFileSync(new URL(file, fixturesDir), 'utf-8'));
  },
};

// Serves one fixed HTML page regardless of the requested URL, for crafted rows.
function staticFetcher(html: string): TextFetcher {
  return { fetchText: () => Promise.resolve(html) };
}

function makeConfig(overrides: Partial<WebtracCourseConfig> = {}): WebtracCourseConfig {
  return {
    courseId: 'holiday-park-championship',
    // Deliberately unlike the page's "Holiday Park 18 Hole" course cell.
    courseName: 'Holiday Park Championship',
    timeZone: 'America/Regina',
    bookingPortalUrl: 'https://leisure.saskatoon.ca/webtrac/web/search.html',
    maxAdvanceDays: 7,
    releaseTime: '06:00',
    pricing: { rules: [] },
    secondaryCode: 1,
    holes: [18, 9],
    ...overrides,
  };
}

// Wraps crafted rows in the results table WebTrac serves (header in <thead>).
function tablePage(rowsHtml: string): string {
  return `<table id="grwebsearch_output_table"><thead><tr><th>h</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

interface RowSpec {
  cart: 'success' | 'phone-only' | 'error';
  openSlots: number;
  holes: string;
  href?: string;
  date?: string;
  time?: string;
  omitHoles?: boolean;
}

function craftRow(spec: RowSpec): string {
  const href =
    spec.href ??
    'https://leisure.saskatoon.ca/webtrac/web/addtocart.html?GlobalSalesArea_GRNumSlots=1';
  const cart =
    spec.cart === 'success'
      ? `<a class="button success cart-button" href="${href}">Add To Cart</a>`
      : spec.cart === 'phone-only'
        ? `<a class="button error cart-button" href="#" data-tooltip="Unavailable Individual Allowance Rules">Unavailable</a>`
        : `<a class="button error cart-button" href="#" data-tooltip="This tee time's back nine is Closed.">Unavailable</a>`;
  const holesCell = spec.omitHoles ? '' : `<td data-title="Holes">${spec.holes}</td>`;
  return (
    `<tr><td data-title="">${cart}</td>` +
    `<td data-title="Course">Some Course</td>` +
    `<td data-title="Date">${spec.date ?? '07/15/2026'}</td>` +
    `<td data-title="Time">${spec.time ?? ' 6:00 am'}</td>` +
    `<td data-title="Open Slots">${spec.openSlots}</td>` +
    holesCell +
    `</tr>`
  );
}

describe('WebtracScraper', () => {
  it('exposes its platform and courses', () => {
    const scraper = new WebtracScraper([makeConfig()], fixtureFetcher);

    expect(scraper.platform).toBe('webtrac');
    expect(scraper.courses).toHaveLength(1);
  });

  it('throws for a course it does not serve', async () => {
    const scraper = new WebtracScraper([makeConfig()], fixtureFetcher);

    await expect(scraper.scrape('unknown-course', '2026-07-15')).rejects.toThrow(
      /unknown course/
    );
  });

  it('fans out over hole counts and concatenates the parsed results', async () => {
    const scraper = new WebtracScraper([makeConfig()], fixtureFetcher);

    const teeTimes = await scraper.scrape('holiday-park-championship', '2026-07-15');

    expect(new Set(teeTimes.map((t) => t.holes))).toEqual(new Set([18, 9]));
    expect(teeTimes.length).toBeGreaterThan(0);
    expect(teeTimes.every((t) => t.dynamicPrice === null)).toBe(true);
    expect(teeTimes.every((t) => t.startInstant.endsWith('-06:00'))).toBe(true);
  });

  it('attributes records to the requested course, not the page label', async () => {
    const scraper = new WebtracScraper([makeConfig()], fixtureFetcher);

    const teeTimes = await scraper.scrape('holiday-park-championship', '2026-07-15');

    expect(
      teeTimes.every(
        (t) =>
          t.courseId === 'holiday-park-championship' &&
          t.courseName === 'Holiday Park Championship'
      )
    ).toBe(true);
  });
});

describe('WebtracScraper online-bookable rows', () => {
  it('retains success rows with a booking URL per contiguous group size', async () => {
    const scraper = new WebtracScraper([makeConfig({ holes: [18] })], fixtureFetcher);

    const teeTimes = await scraper.scrape('holiday-park-championship', '2026-07-15');

    expect(teeTimes.length).toBeGreaterThan(0);
    for (const teeTime of teeTimes) {
      const ascending = [...teeTime.groupSizes].sort((a, b) => a - b);
      expect(teeTime.groupSizes).toEqual(ascending);
      expect(teeTime.groupSizes[0]).toBe(1);
      expect(
        Object.keys(reservationUrls(teeTime))
          .map(Number)
          .sort((a, b) => a - b)
      ).toEqual(teeTime.groupSizes);
    }
  });

  it('sets GlobalSalesArea_GRNumSlots per group size, contiguous from open slots', async () => {
    const scraper = new WebtracScraper(
      [makeConfig({ holes: [18] })],
      staticFetcher(
        tablePage(craftRow({ cart: 'success', openSlots: 3, holes: '18 (Front)' }))
      )
    );

    const [teeTime] = await scraper.scrape('holiday-park-championship', '2026-07-15');

    expect(teeTime?.groupSizes).toEqual([1, 2, 3]);
    const urls = reservationUrls(teeTime);
    for (const groupSize of teeTime?.groupSizes ?? []) {
      const url = new URL(urls[groupSize] ?? '');
      expect(url.searchParams.get('GlobalSalesArea_GRNumSlots')).toBe(
        String(groupSize)
      );
    }
  });

  it('caps group sizes at four regardless of open slots', async () => {
    const scraper = new WebtracScraper(
      [makeConfig({ holes: [18] })],
      staticFetcher(
        tablePage(craftRow({ cart: 'success', openSlots: 6, holes: '18 (Front)' }))
      )
    );

    const [teeTime] = await scraper.scrape('holiday-park-championship', '2026-07-15');

    expect(teeTime?.groupSizes).toEqual([1, 2, 3, 4]);
  });
});

describe('WebtracScraper phone-only rows', () => {
  it('keeps same-day phone-only rows on the phone arm, which carries no URL', async () => {
    const scraper = new WebtracScraper([makeConfig({ holes: [18] })], fixtureFetcher);

    const teeTimes = await scraper.scrape('holiday-park-championship', '2026-07-11');

    expect(teeTimes.length).toBeGreaterThan(0);
    for (const teeTime of teeTimes) {
      expect(teeTime.booking).toEqual({ kind: 'phone' });
      expect(teeTime.groupSizes.length).toBeGreaterThan(0);
    }
  });

  it('gives a phone-only row the same group sizes a bookable row would get', async () => {
    const scraper = new WebtracScraper(
      [makeConfig({ holes: [18] })],
      staticFetcher(
        tablePage(craftRow({ cart: 'phone-only', openSlots: 3, holes: '18 (Front)' }))
      )
    );

    const [teeTime] = await scraper.scrape('holiday-park-championship', '2026-07-15');

    expect(teeTime?.booking.kind).toBe('phone');
    expect(teeTime?.groupSizes).toEqual([1, 2, 3]);
  });
});

describe('WebtracScraper dropped rows', () => {
  it('drops error rows lacking the phone-only tooltip', async () => {
    const scraper = new WebtracScraper(
      [
        makeConfig({
          courseId: 'silverwood',
          courseName: 'Silverwood',
          secondaryCode: 3,
          holes: [18],
        }),
      ],
      fixtureFetcher
    );

    const teeTimes = await scraper.scrape('silverwood', '2026-07-15');

    // The 18h fixture mixes 22 online-bookable rows with 13 non-phone-only error rows.
    expect(teeTimes).toHaveLength(22);
    expect(teeTimes.every((t) => t.booking.kind === 'reservation')).toBe(true);
  });

  it('drops rows reporting zero open slots', async () => {
    const scraper = new WebtracScraper(
      [makeConfig({ holes: [18] })],
      staticFetcher(
        tablePage(
          craftRow({ cart: 'success', openSlots: 0, holes: '18 (Front)' }) +
            craftRow({ cart: 'success', openSlots: 2, holes: '18 (Front)' })
        )
      )
    );

    const teeTimes = await scraper.scrape('holiday-park-championship', '2026-07-15');

    expect(teeTimes).toHaveLength(1);
    expect(teeTimes[0]?.groupSizes).toEqual([1, 2]);
  });
});

describe('WebtracScraper routing', () => {
  it('routes an 18-hole Front start as Front then Back', async () => {
    const scraper = new WebtracScraper([makeConfig({ holes: [18] })], fixtureFetcher);

    const teeTimes = await scraper.scrape('holiday-park-championship', '2026-07-15');

    expect(
      teeTimes.every((t) => JSON.stringify(t.routing) === '["Front","Back"]')
    ).toBe(true);
  });

  it('routes an 18-hole Back start as Back then Front', async () => {
    const scraper = new WebtracScraper(
      [makeConfig({ holes: [18] })],
      staticFetcher(
        tablePage(craftRow({ cart: 'success', openSlots: 2, holes: '18 (Back)' }))
      )
    );

    const [teeTime] = await scraper.scrape('holiday-park-championship', '2026-07-15');

    expect(teeTime?.routing).toEqual(['Back', 'Front']);
  });

  it('routes a 9-hole start as its single set', async () => {
    const scraper = new WebtracScraper(
      [
        makeConfig({
          courseId: 'silverwood',
          courseName: 'Silverwood',
          secondaryCode: 3,
          holes: [9],
        }),
      ],
      fixtureFetcher
    );

    const teeTimes = await scraper.scrape('silverwood', '2026-07-15');

    const routings = new Set(teeTimes.map((t) => JSON.stringify(t.routing)));
    expect(routings).toContain('["Front"]');
    expect(routings).toContain('["Back"]');
  });
});

describe('WebtracScraper markup drift', () => {
  it('throws when a retained row is missing an expected cell', async () => {
    const scraper = new WebtracScraper(
      [makeConfig({ holes: [18] })],
      staticFetcher(
        tablePage(
          craftRow({
            cart: 'success',
            openSlots: 2,
            holes: '18 (Front)',
            omitHoles: true,
          })
        )
      )
    );

    await expect(
      scraper.scrape('holiday-park-championship', '2026-07-15')
    ).rejects.toThrow(/Holes/);
  });
});

describe('WebtracScraper record shape', () => {
  it('produces schema-shaped records for a fixture page', async () => {
    const scraper = new WebtracScraper([makeConfig({ holes: [18] })], fixtureFetcher);

    const teeTimes: ScrapedTeeTime[] = await scraper.scrape(
      'holiday-park-championship',
      '2026-07-15'
    );

    const [teeTime] = teeTimes;
    expect(teeTime?.startInstant).toMatch(/^2026-07-15T\d{2}:\d{2}:00-06:00$/);
    expect(teeTime?.holes).toBe(18);
    expect(teeTime?.dynamicPrice).toBeNull();
  });
});
