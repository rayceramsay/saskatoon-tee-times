import type { CoursePricingConfig } from '../../../domain/pricing-engine.js';
import type { WebtracCourseConfig } from '../webtrac-course-config.js';

// Local day-of-week sets (0 = Sunday) for the city's rate card: weekday rates
// bill Mon–Thu, weekend rates bill Fri–Sun.
const WEEKDAYS = [1, 2, 3, 4];
const WEEKEND = [5, 6, 0];

/**
 * WebTrac booking configuration for the Wildwood course.
 *
 * Fans out over its 18- and 9-hole search pages under `secondarycode=4`.
 */
export const wildwoodConfig: WebtracCourseConfig = {
  courseId: 'wildwood',
  courseName: 'Wildwood',
  timeZone: 'America/Regina',
  bookingPortalUrl:
    'https://leisure.saskatoon.ca/webtrac/web/search.html?module=GR&secondarycode=4',
  maxAdvanceDays: 7,
  releaseTime: '06:00',
  secondaryCode: 4,
  holes: [18, 9],
};

/**
 * Pricing configuration for the Wildwood course.
 *
 * Static, city-published after-tax green fees — no dynamic price is scraped, so
 * no `tax` rule is needed. Re-verify these numbers against the city's annual
 * green-fee rate card each season.
 */
export const wildwoodPricingConfig: CoursePricingConfig = {
  rules: [
    { holes: 18, daysOfWeek: WEEKDAYS, price: 47 },
    { holes: 18, daysOfWeek: WEEKEND, price: 50 },
    { holes: 9, daysOfWeek: WEEKDAYS, price: 28 },
    { holes: 9, daysOfWeek: WEEKEND, price: 30 },
  ],
};
