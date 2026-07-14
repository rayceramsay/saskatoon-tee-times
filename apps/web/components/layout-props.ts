import type { ViewResult } from '../lib/apply-view.util';
import type { CourseOption, FreshnessState } from '../lib/derived.util';
import type { ViewState } from '../lib/view-state.util';

/** The listing area's mutually exclusive display states. */
export type ListingStatus = 'skeleton' | 'error' | 'ready';

/** Everything both responsive layouts need to render and mutate the dashboard. */
export interface LayoutProps {
  viewState: ViewState;
  courses: CourseOption[];
  today: string;
  now: Date;
  /** Date of the tee times currently rendered; lags `viewState.date` while a date change loads so the summary only flips once the new day's slots are present. */
  displayedDate: string;
  result: ViewResult;
  status: ListingStatus;
  /** The results list is catching up to a newly applied filter (optimistic controls already updated). */
  listingPending: boolean;
  freshness: FreshnessState;
  freshnessLoading: boolean;
  /** Date changes push a history entry; other filters replace it in place. */
  onDateChange: (date: string) => void;
  onFilterChange: (patch: Partial<ViewState>) => void;
  onReset: () => void;
  onRetry: () => void;
}
