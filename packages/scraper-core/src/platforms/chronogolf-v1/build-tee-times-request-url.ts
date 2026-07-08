import type { GroupSize } from '../../schema/group-size.js';
import type { ChronogolfV1CourseConfig } from './chronogolf-v1-config.js';

/**
 * Inputs identifying a single Chronogolf V1 tee-times query.
 *
 * One query targets a specific listing (sub-course + hole count) on a date for
 * a specific party size.
 */
export interface ChronogolfV1RequestParams {
  // Local calendar date to query, formatted as YYYY-MM-DD.
  date: string;
  // Chronogolf course_id of the listing being queried.
  chronogolfCourseId: number;
  // Hole count of the listing being queried.
  nbHoles: number;
  // Party size to query; the affiliation param is repeated once per player.
  groupSize: GroupSize;
}

/**
 * Build the Chronogolf V1 tee-times request URL for one listing query.
 *
 * The `affiliation_type_ids[]` parameter is repeated once per player because
 * Chronogolf reveals a slot's availability only relative to the queried party
 * size.
 *
 * @param config - The course's Chronogolf V1 configuration (mirror and ids).
 * @param params - The listing, date, and party size to query.
 * @returns The fully qualified request URL.
 */
export function buildTeeTimesRequestUrl(
  config: ChronogolfV1CourseConfig,
  params: ChronogolfV1RequestParams
): string {
  const url = new URL(
    `https://www.chronogolf.${config.tld}/marketplace/clubs/${config.clubId}/teetimes`
  );

  url.searchParams.set('date', params.date);
  url.searchParams.set('course_id', String(params.chronogolfCourseId));
  for (let player = 0; player < params.groupSize; player++) {
    url.searchParams.append('affiliation_type_ids[]', String(config.affiliationTypeId));
  }
  url.searchParams.set('nb_holes', String(params.nbHoles));

  return url.toString();
}
