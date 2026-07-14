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
    <div className="flex items-center gap-2.5 border-y border-line bg-bg px-4 py-2">
      <span className="flex-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-2">
        {group.name}
      </span>
      <span className="text-[11px] text-ink-3">{group.teeTimes.length} slots</span>
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
      <header className="shrink-0 border-b border-line bg-panel px-4 pb-2.5 pt-3">
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
          className="px-4 pb-1 pt-2 text-meta text-ink-3"
        >
          {status === 'ready' ? summary : ' '}
        </div>
        {status === 'skeleton' && <MobileSkeletonRows />}
        {status === 'error' && <ErrorState onRetry={props.onRetry} />}
        {status === 'ready' && count === 0 && <EmptyState onReset={props.onReset} />}
        {status === 'ready' && count > 0 && rows}
      </main>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2.5 border-t border-line bg-panel px-4 pb-4 pt-2.5">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex flex-1 items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-2 text-[14px] font-semibold text-ink"
        >
          <span aria-hidden>📅</span>
          {formatDateChip(viewState.date)}
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-line bg-bg px-3.5 text-[13px] font-semibold text-ink"
        >
          Filters
          {badge > 0 && (
            <span className="rounded-[10px] bg-ink px-1.5 text-[10px] font-bold text-white">
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
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[88%] overflow-y-auto rounded-t-2xl bg-panel pb-8">
            <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-line" />
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
