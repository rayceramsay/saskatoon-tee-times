'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react';
import { applyView } from '../lib/apply-view.util';
import { todayInCourseTz } from '../lib/course-local-time.util';
import { availableCourses, freshnessState } from '../lib/derived.util';
import type { TeeTime } from '../lib/tee-time-response.schema';
import { useTeeTimes } from '../lib/use-tee-times';
import {
  EARLIEST_START_FLOOR,
  parseViewState,
  serializeViewState,
  type ViewState,
} from '../lib/view-state.util';
import { DesktopLayout } from '../components/desktop-layout';
import type { LayoutProps, ListingStatus } from '../components/layout-props';
import { MobileLayout } from '../components/mobile-layout';

/** Stable empty reference so memoized derivations don't invalidate before data loads. */
const NO_TEE_TIMES: TeeTime[] = [];

/** Merge a filter patch (including the full reset) onto the optimistic view state. */
function applyPatch(base: ViewState, patch: Partial<ViewState>): ViewState {
  return { ...base, ...patch };
}

/** Re-render each minute so past slots drop out and freshness ages accurately. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Turn `active` on only once it has held for `delayMs`, and off immediately.
 *
 * Keeps a near-instant change (a client-side filter, or an already-cached date)
 * from flashing the pending treatment, while still clearing it the moment the
 * selection settles.
 */
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setShown(true), delayMs);
    return () => {
      clearTimeout(id);
      setShown(false);
    };
  }, [active, delayMs]);
  return shown;
}

/** How long a change must stay unresolved before the pending treatment appears. */
const PENDING_TREATMENT_DELAY_MS = 100;

/** The dashboard: derives view state from the URL, fetches by date, and renders both layouts. */
export function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow();
  const today = todayInCourseTz(now);

  const searchString = searchParams.toString();
  const viewState = useMemo(
    () => parseViewState(new URLSearchParams(searchString), today),
    [searchString, today]
  );

  const [optimisticViewState, patchOptimistic] = useOptimistic(viewState, applyPatch);
  const [isPending, startTransition] = useTransition();

  const { data, error, isLoading, isValidating, mutate } = useTeeTimes(viewState.date);

  const teeTimes = data?.teeTimes ?? NO_TEE_TIMES;
  const courses = useMemo(() => availableCourses(teeTimes), [teeTimes]);
  const result = useMemo(
    () => applyView(teeTimes, viewState, now),
    [teeTimes, viewState, now]
  );

  // The listing is "catching up" while the client recompute hasn't committed
  // (isPending) OR the loaded data is for a different date than the one we're
  // fetching (a date change is mid-flight — data.date lags until it lands). The
  // treatment clears only when both are false, so the controls' change and the
  // resolved rows are revealed together; the delay keeps instant changes calm.
  const listingBusy = isPending || (data !== undefined && data.date !== viewState.date);
  const listingPending = useDelayedFlag(listingBusy, PENDING_TREATMENT_DELAY_MS);

  const status: ListingStatus = error
    ? 'error'
    : data === undefined
      ? 'skeleton'
      : 'ready';
  const freshness = error
    ? { level: 'none' as const, label: '—' }
    : freshnessState(data?.lastUpdatedAt ?? null, now);
  const freshnessLoading = !error && (isLoading || isValidating);

  // Apply the patch to the optimistic overlay synchronously (immediate control
  // feedback), then push it to the canonical URL inside a transition so the URL
  // propagation and list recompute stay off the control's commit. The optimistic
  // base is the source for the next URL so rapid toggles never read stale state.
  const navigate = (patch: Partial<ViewState>, mode: 'push' | 'replace') => {
    const query = serializeViewState(applyPatch(optimisticViewState, patch), today);
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      patchOptimistic(patch);
      if (mode === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    });
  };

  const layoutProps: LayoutProps = {
    viewState: optimisticViewState,
    courses,
    today,
    now,
    displayedDate: data?.date ?? viewState.date,
    result,
    status,
    listingPending,
    freshness,
    freshnessLoading,
    onDateChange: (date) => navigate({ date }, 'push'),
    onFilterChange: (patch) => navigate(patch, 'replace'),
    onReset: () =>
      navigate(
        {
          holes: null,
          players: null,
          from: EARLIEST_START_FLOOR,
          courses: null,
          group: false,
        },
        'replace'
      ),
    onRetry: () => {
      void mutate();
    },
  };

  return (
    <>
      <a
        href="#listings"
        className="focus:bg-panel focus:text-body-primary sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to tee times
      </a>
      <div className="hidden md:block">
        <DesktopLayout {...layoutProps} />
      </div>
      <div className="md:hidden">
        <MobileLayout {...layoutProps} />
      </div>
    </>
  );
}
