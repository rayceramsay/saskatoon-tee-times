import type { WebtracCourseConfig } from '../webtrac-course-config.js';

// Local day-of-week sets (0 = Sunday) for the city's rate card: weekday rates
// bill Mon–Thu, weekend rates bill Fri–Sun.
const WEEKDAYS = [1, 2, 3, 4];
const WEEKEND = [5, 6, 0];

/**
 * WebTrac booking configuration for the Silverwood course.
 *
 * Fans out over its 18- and 9-hole search pages under `secondarycode=3`.
 */
export const silverwoodConfig: WebtracCourseConfig = {
  courseId: 'silverwood',
  courseName: 'Silverwood',
  timeZone: 'America/Regina',
  bookingPortalUrl:
    'https://leisure.saskatoon.ca/webtrac/web/search.html?module=GR&secondarycode=3',
  maxAdvanceDays: 7,
  releaseTime: '06:00',
  // Static, city-published after-tax green fees — no dynamic price is scraped, so
  // no `tax` rule is needed. Re-verify these numbers against the city's annual
  // green-fee rate card each season.
  pricing: {
    rules: [
      { holes: 18, daysOfWeek: WEEKDAYS, price: 42 },
      { holes: 18, daysOfWeek: WEEKEND, price: 45 },
      { holes: 9, daysOfWeek: WEEKDAYS, price: 25 },
      { holes: 9, daysOfWeek: WEEKEND, price: 27 },
    ],
  },
  secondaryCode: 3,
  holes: [18, 9],
};
