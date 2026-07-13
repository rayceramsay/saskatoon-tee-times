'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { applyView } from '../lib/apply-view.util';
import { todayInCourseTz } from '../lib/course-local-time.util';
import { availableCourses, freshnessState } from '../lib/derived.util';
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

/** Re-render each minute so past slots drop out and freshness ages accurately. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** The dashboard: derives view state from the URL, fetches by date, and renders both layouts. */
export function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow();
  const today = todayInCourseTz(now);

  const viewState = parseViewState(new URLSearchParams(searchParams.toString()), today);
  const { data, error, isLoading, isValidating, mutate } = useTeeTimes(viewState.date);

  const teeTimes = data?.teeTimes ?? [];
  const courses = availableCourses(teeTimes);
  const result = applyView(teeTimes, viewState, now);

  const status: ListingStatus = error
    ? 'error'
    : data === undefined
      ? 'skeleton'
      : 'ready';
  const freshness = error
    ? { level: 'none' as const, label: '—' }
    : freshnessState(data?.lastUpdatedAt ?? null, now);
  const freshnessLoading = !error && (isLoading || isValidating);

  const navigate = (next: ViewState, mode: 'push' | 'replace') => {
    const query = serializeViewState(next, today);
    const href = query ? `${pathname}?${query}` : pathname;
    if (mode === 'push') router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  };

  const layoutProps: LayoutProps = {
    viewState,
    courses,
    today,
    now,
    result,
    status,
    freshness,
    freshnessLoading,
    onDateChange: (date) => navigate({ ...viewState, date }, 'push'),
    onFilterChange: (patch) => navigate({ ...viewState, ...patch }, 'replace'),
    onReset: () =>
      navigate(
        {
          date: viewState.date,
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
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-panel focus:px-3 focus:py-2 focus:text-body-primary"
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
