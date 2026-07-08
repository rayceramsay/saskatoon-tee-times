import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { JsonFetcher } from '../json-fetcher.js';
import { ChronogolfV1Scraper } from './chronogolf-v1-scraper.js';
import type { ChronogolfV1CourseConfig } from './chronogolf-v1-config.js';

const DATE = '2026-07-11';
const fixturesDir = new URL('./__fixtures__/', import.meta.url);

// Serves the committed fixtures by reading nb_holes and the party size (the
// number of repeated affiliation params) out of the requested URL.
const fixtureFetcher: JsonFetcher = {
  fetchJson(url: string): Promise<unknown> {
    const parsed = new URL(url);
    const nbHoles = parsed.searchParams.get('nb_holes');
    const players = parsed.searchParams.getAll('affiliation_type_ids[]').length;
    const json = readFileSync(
      new URL(`greenbryre-2020-${nbHoles}h-${players}p.json`, fixturesDir),
      'utf-8'
    );
    return Promise.resolve(JSON.parse(json));
  },
};

// Only the two main-course listings, which have committed fixtures.
const testConfig: ChronogolfV1CourseConfig = {
  courseId: 'greenbryre',
  courseName: 'Greenbryre',
  timeZone: 'America/Regina',
  bookingPortalUrl: 'https://greenbryre.com/book-a-tee-time/',
  tld: 'ca',
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
});
