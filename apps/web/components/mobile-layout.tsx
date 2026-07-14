'use client';

import { useState } from 'react';
import type { CourseGroup } from '../lib/apply-view.util';
import { activeFilterCount, freshnessState, teeTimeKey } from '../lib/derived.util';
import { courseSummary, formatDateChip } from '../lib/format.util';
import { FilterSections } from './filters';
import { FreshnessIndicator } from './freshness-indicator';
import type { LayoutProps } from './layout-props';
import { MobileTeeTimeRow } from './mobile-tee-time-row';
import { EmptyState, ErrorState, MobileSkeletonRows } from './state-views';

function latestScrapedAt(group: CourseGroup): string {
  return group.teeTimes.reduce(
    (latest, teeTime) => (teeTime.scrapedAt > latest ? teeTime.scrapedAt : latest),
    group.teeTimes[0]!.scrapedAt
  );
}

function GroupHeader({ group, now }: { group: CourseGroup; now: Date }) {
  return (
    <div className="border-line bg-bg flex items-center gap-2.5 border-y px-4 py-2">
      <span className="text-ink-2 flex-1 text-[11px] font-bold tracking-[0.05em] uppercase">
        {group.name}
      </span>
      <span className="text-ink-3 text-[11px]">{group.teeTimes.length} slots</span>
      <FreshnessIndicator state={freshnessState(latestScrapedAt(group), now)} />
    </div>
  );
}

/** The mobile dashboard: full-screen list, sticky topbar, bottom-sheet filters. */
export function MobileLayout(props: LayoutProps) {
  const {
    viewState,
    displayedDate,
    courses,
    today,
    result,
    status,
    listingPending,
    freshness,
    freshnessLoading,
    now,
  } = props;
  const [sheetOpen, setSheetOpen] = useState(false);

  const showPending = status === 'ready' && listingPending;
  const count = result.teeTimes.length;
  const todayLabel = displayedDate === today ? ' today' : '';
  const summary = `${count} tee times${todayLabel} · ${courseSummary(viewState.courses, courses)}`;
  const badge = activeFilterCount(viewState, today);

  const rows =
    result.groups !== null
      ? result.groups.map((group) => (
          <div key={group.id}>
            <GroupHeader group={group} now={now} />
            {group.teeTimes.map((slot) => (
              <MobileTeeTimeRow
                key={teeTimeKey(slot)}
                slot={slot}
                players={viewState.players}
              />
            ))}
          </div>
        ))
      : result.teeTimes.map((slot) => (
          <MobileTeeTimeRow
            key={teeTimeKey(slot)}
            slot={slot}
            players={viewState.players}
          />
        ));

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      <header className="border-line bg-panel shrink-0 border-b px-4 pt-3 pb-2.5">
        <div className="text-[15px] font-bold">Saskatoon Tee Times</div>
        <div className="mt-0.5">
          <FreshnessIndicator state={freshness} loading={freshnessLoading} />
        </div>
      </header>

      <main
        id="listings"
        aria-busy={status === 'skeleton' || showPending}
        className={`flex-1 overflow-y-auto pb-[72px] ${showPending ? 'not-motion-safe:opacity-60 motion-safe:animate-pulse' : ''}`}
      >
        <div
          role="status"
          aria-live="polite"
          className="text-meta text-ink-3 px-4 pt-2 pb-1"
        >
          {status === 'ready' ? summary : ' '}
        </div>
        {status === 'skeleton' && <MobileSkeletonRows />}
        {status === 'error' && <ErrorState onRetry={props.onRetry} />}
        {status === 'ready' && count === 0 && <EmptyState onReset={props.onReset} />}
        {status === 'ready' && count > 0 && rows}
      </main>

      <div className="border-line bg-panel absolute inset-x-0 bottom-0 z-10 flex items-center gap-2.5 border-t px-4 pt-2.5 pb-4">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="border-line bg-bg text-ink flex flex-1 items-center gap-1.5 rounded-lg border px-3 py-2 text-[14px] font-semibold"
        >
          <span aria-hidden>📅</span>
          {formatDateChip(viewState.date)}
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="border-line bg-bg text-ink flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-semibold"
        >
          Filters
          {badge > 0 && (
            <span className="bg-ink rounded-[10px] px-1.5 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
        </button>
      </div>

      {sheetOpen && (
        <>
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 z-20 bg-black/35"
          />
          <div className="bg-panel absolute inset-x-0 bottom-0 z-30 max-h-[88%] overflow-y-auto rounded-t-2xl pb-8">
            <div className="bg-line mx-auto mt-2.5 h-1 w-9 rounded-full" />
            <div className="px-4 pt-3.5 text-[16px] font-bold">Filters</div>
            <div className="px-4 pt-4">
              <FilterSections {...props} calendarMode="inline" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
