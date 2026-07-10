import type { CoursePricingConfig } from '../../../domain/pricing-engine.js';
import type { ChronogolfV1CourseConfig } from '../chronogolf-v1-course-config.js';

/**
 * Chronogolf V1 booking configuration for Greenbryre Golf Club.
 *
 * Fans out over the main course at 12 and 6 holes plus a North-only 6-hole
 * early-bird listing exposed under a separate Chronogolf course id.
 */
export const greenbryreConfig: ChronogolfV1CourseConfig = {
  courseId: 'greenbryre',
  courseName: 'Greenbryre',
  timeZone: 'America/Regina',
  bookingPortalUrl: 'https://greenbryre.com/book-a-tee-time/',
  maxAdvanceDays: 7,
  releaseTime: '06:00',
  tld: 'ca',
  bookingTld: 'ca',
  slug: 'greenbryre-country-club-closed-until-2013-season',
  clubId: 1743,
  affiliationTypeId: 7689,
  listings: [
    { chronogolfCourseId: 2020, nbHoles: 12, routing: [] },
    { chronogolfCourseId: 2020, nbHoles: 6, routing: [] },
    { chronogolfCourseId: 26895, nbHoles: 6, routing: ['North'] },
  ],
};

/**
 * Pricing configuration for Greenbryre.
 *
 * Greenbryre's scraped green fee is pre-tax, so the engine grosses it up by the
 * course's tax rate; no static rules are configured (it is dynamic-priced).
 */
export const greenbryrePricingConfig: CoursePricingConfig = {
  tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 },
  rules: [],
};
