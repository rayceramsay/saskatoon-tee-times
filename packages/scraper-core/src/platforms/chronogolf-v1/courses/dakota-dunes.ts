import type { CoursePricingConfig } from '../../../domain/pricing-engine.js';
import type { ChronogolfV1CourseConfig } from '../chronogolf-v1-course-config.js';

/**
 * Chronogolf V1 booking configuration for Dakota Dunes Golf Links.
 *
 * Fans out over a single Chronogolf course id at 18 and 9 holes, both with
 * empty routing.
 */
export const dakotaDunesConfig: ChronogolfV1CourseConfig = {
  courseId: 'dakota-dunes',
  courseName: 'Dakota Dunes',
  timeZone: 'America/Regina',
  bookingPortalUrl: 'https://golf.dakotadunesresort.com/book-tee-time/',
  maxAdvanceDays: 7,
  releaseTime: '00:00',
  tld: 'ie',
  bookingTld: 'ca',
  slug: 'dakota-dunes-golf-links',
  clubId: 19739,
  affiliationTypeId: 146788,
  listings: [
    { chronogolfCourseId: 27975, nbHoles: 18, routing: [] },
    { chronogolfCourseId: 27975, nbHoles: 9, routing: [] },
  ],
};

/**
 * Pricing configuration for Dakota Dunes.
 *
 * Dakota Dunes' scraped green fee is pre-tax, so the engine grosses it up by the
 * course's tax rate; no static rules are configured (it is dynamic-priced).
 */
export const dakotaDunesPricingConfig: CoursePricingConfig = {
  tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 },
  rules: [],
};
