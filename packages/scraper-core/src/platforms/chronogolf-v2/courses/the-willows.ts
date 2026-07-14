import type { CoursePricingConfig } from '../../../domain/pricing-engine.js';
import type { ChronogolfV2CourseConfig } from '../chronogolf-v2-course-config.js';

/**
 * Chronogolf V2 booking configuration for The Willows Golf & Country Club.
 *
 * The Willows exposes three physical loops (Bridges, Lakes, Xena) under one
 * course; each start is attributed to its loop with a unique tee-time id. The
 * trailing `'18'` in `courseIds` is a combined-round toggle: it unlocks
 * `bookable_holes: [9, 18]` on each start and injects no rows of its own.
 */
export const theWillowsConfig: ChronogolfV2CourseConfig = {
  courseId: 'the-willows',
  courseName: 'The Willows',
  timeZone: 'America/Regina',
  bookingPortalUrl:
    'https://www.chronogolf.ca/club/the-willows-golf-country-club-saskatchewan-saskatoon/booking',
  maxAdvanceDays: 5,
  releaseTime: '07:00',
  courseIds: [
    '25664982-9496-4843-8b9d-581b981d698c',
    '5fdf8123-a394-4533-aa03-ae11d9d60650',
    '2e7ff0bb-4cc8-4b85-85be-2a4f9a2813d0',
    '18',
  ],
  slug: 'the-willows-golf-country-club-saskatchewan-saskatoon',
  affiliationTypeId: 110161,
  tld: 'de',
  bookingTld: 'com',
};

/**
 * Pricing configuration for The Willows.
 *
 * The V2 feed's scraped green fee is pre-tax, so the engine grosses it up by the
 * course's tax rate; no static rules are configured (it is dynamic-priced). The
 * 18-hole record carries no scraped price and resolves to `pricePerPlayer: null`.
 */
export const theWillowsPricingConfig: CoursePricingConfig = {
  tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 },
  rules: [],
};
