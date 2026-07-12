import type { CoursePricingConfig } from '../../../domain/pricing-engine.js';
import type { WebtracCourseConfig } from '../webtrac-course-config.js';

// Local day-of-week sets (0 = Sunday) for the city's rate card: weekday rates
// bill Mon–Thu, weekend rates bill Fri–Sun.
const WEEKDAYS = [1, 2, 3, 4];
const WEEKEND = [5, 6, 0];

/**
 * WebTrac booking configuration for the Holiday Park executive 9 course.
 *
 * A 9-hole-only course scraped under `secondarycode=2`.
 */
export const holidayParkExecutive9Config: WebtracCourseConfig = {
  courseId: 'holiday-park-executive-9',
  courseName: 'Holiday Park Executive 9',
  timeZone: 'America/Regina',
  bookingPortalUrl:
    'https://leisure.saskatoon.ca/webtrac/web/search.html?module=GR&secondarycode=2',
  maxAdvanceDays: 7,
  releaseTime: '06:00',
  secondaryCode: 2,
  holes: [9],
};

/**
 * Pricing configuration for the Holiday Park executive 9 course.
 *
 * Static, city-published after-tax green fees — no dynamic price is scraped, so
 * no `tax` rule is needed. Re-verify these numbers against the city's annual
 * green-fee rate card each season.
 */
export const holidayParkExecutive9PricingConfig: CoursePricingConfig = {
  rules: [
    { holes: 9, daysOfWeek: WEEKDAYS, price: 31 },
    { holes: 9, daysOfWeek: WEEKEND, price: 35 },
  ],
};
