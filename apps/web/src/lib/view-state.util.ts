/** Earliest-start floor ("Any time"); omitted from the URL when at this value. */
export const EARLIEST_START_FLOOR = '05:00';

/** Latest selectable earliest-start value. */
export const EARLIEST_START_CEILING = '21:00';

/** Selectable hole counts (a single value or "any"). */
export const HOLES_OPTIONS = [6, 9, 12, 18] as const;

/** Selectable player counts (a single value or "any"). */
export const PLAYERS_OPTIONS = [1, 2, 3, 4] as const;

/**
 * The complete dashboard view state, the single source of truth for what the
 * page renders. Every field is derived from the URL query string on each render.
 */
export interface ViewState {
  /** Selected local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Selected hole count, or null for "any". */
  holes: number | null;
  /** Selected player count, or null for "any". */
  players: number | null;
  /** Earliest-start floor as `HH:MM` (24-hour); {@link EARLIEST_START_FLOOR} means "any time". */
  from: string;
  /** Selected course slugs, or null for "all courses". An empty array means none selected. */
  courses: string[] | null;
  /** Whether results are grouped by course. */
  group: boolean;
}

/** Hourly earliest-start stops from the floor through the ceiling, e.g. `05:00`…`21:00`. */
export const EARLIEST_START_STOPS: readonly string[] = buildHourlyStops();

function buildHourlyStops(): string[] {
  const first = Number(EARLIEST_START_FLOOR.slice(0, 2));
  const last = Number(EARLIEST_START_CEILING.slice(0, 2));
  const stops: string[] = [];
  for (let hour = first; hour <= last; hour++) {
    stops.push(`${String(hour).padStart(2, '0')}:00`);
  }
  return stops;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Derive the view state from a URL query string.
 *
 * Parsing is total: unrecognized or out-of-range values silently fall back to
 * their defaults rather than raising, so a malformed shared link still loads.
 *
 * @param params - The URL's query parameters.
 * @param today - The course-local date used as the default when `date` is absent or invalid.
 * @returns The resolved view state.
 */
export function parseViewState(params: URLSearchParams, today: string): ViewState {
  const dateParam = params.get('date');
  const date = dateParam && isValidDate(dateParam) ? dateParam : today;

  const holes = parseEnum(params.get('holes'), HOLES_OPTIONS);
  const players = parseEnum(params.get('players'), PLAYERS_OPTIONS);

  const fromParam = params.get('from');
  const from =
    fromParam && EARLIEST_START_STOPS.includes(fromParam)
      ? fromParam
      : EARLIEST_START_FLOOR;

  const coursesParam = params.get('courses');
  const courses =
    coursesParam === null
      ? null
      : coursesParam.split(',').filter((slug) => slug.length > 0);

  const group = params.get('group') === 'course';

  return { date, holes, players, from, courses, group };
}

function parseEnum(value: string | null, options: readonly number[]): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return options.includes(parsed) ? parsed : null;
}

/**
 * Serialize view state into a URL query string, omitting every field at its
 * default so shared links stay clean.
 *
 * @param viewState - The view state to encode.
 * @param today - The course-local date; a matching `date` is treated as default and omitted.
 * @returns The query string without a leading `?` (empty when everything is default).
 */
export function serializeViewState(viewState: ViewState, today: string): string {
  const params = new URLSearchParams();

  if (viewState.date !== today) params.set('date', viewState.date);
  if (viewState.holes !== null) params.set('holes', String(viewState.holes));
  if (viewState.players !== null) params.set('players', String(viewState.players));
  if (viewState.from !== EARLIEST_START_FLOOR) params.set('from', viewState.from);
  if (viewState.courses !== null) params.set('courses', viewState.courses.join(','));
  if (viewState.group) params.set('group', 'course');

  return params.toString();
}
