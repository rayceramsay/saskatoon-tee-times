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
  result: ViewResult;
  status: ListingStatus;
  freshness: FreshnessState;
  freshnessLoading: boolean;
  /** Date changes push a history entry; other filters replace it in place. */
  onDateChange: (date: string) => void;
  onFilterChange: (patch: Partial<ViewState>) => void;
  onReset: () => void;
  onRetry: () => void;
}
