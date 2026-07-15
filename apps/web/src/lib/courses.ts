/** A course as offered by the Course filter. */
export interface CourseOption {
  id: string;
  name: string;
}

/**
 * The static catalog of all known Saskatoon courses, in display order.
 *
 * Shaped like the future `GET /courses` response so swapping this hardcoded
 * list for a fetched source is isolated to this module. Identities (id + name)
 * are copied from the scraper course configs under
 * `packages/scraper-core/src/platforms/*\/courses/*.ts`, the source of truth;
 * keep them in sync until the endpoint supersedes this list.
 */
export const ALL_COURSES: CourseOption[] = [
  { id: 'holiday-park-championship', name: 'Holiday Park Championship' },
  { id: 'holiday-park-executive-9', name: 'Holiday Park Executive 9' },
  { id: 'wildwood', name: 'Wildwood' },
  { id: 'silverwood', name: 'Silverwood' },
  { id: 'the-willows', name: 'The Willows' },
  { id: 'greenbryre', name: 'Greenbryre' },
  { id: 'dakota-dunes', name: 'Dakota Dunes' },
  { id: 'the-legends', name: 'The Legends' },
];
