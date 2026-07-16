'use client';

import { Drawer } from '@base-ui/react/drawer';
import type { RefObject } from 'react';
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
      <span className="text-ink-3 text-[11px]">{group.teeTimes.length} tee times</span>
      <FreshnessIndicator state={freshnessState(latestScrapedAt(group), now)} />
    </div>
  );
}

/** Detached handle shared by both bottom-bar triggers and the filter drawer. */
const filterDrawerHandle = Drawer.createHandle();

/** The mobile dashboard: full-screen list, sticky topbar, bottom-sheet filters. */
export function MobileLayout({
  portalContainer,
  ...props
}: LayoutProps & { portalContainer: RefObject<HTMLDivElement | null> }) {
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
        <Drawer.Trigger
          handle={filterDrawerHandle}
          className="border-line bg-bg text-ink hover:bg-line-2 flex flex-1 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-[14px] font-semibold motion-safe:transition-colors"
        >
          <span aria-hidden>📅</span>
          {formatDateChip(viewState.date)}
        </Drawer.Trigger>
        <Drawer.Trigger
          handle={filterDrawerHandle}
          className="border-line bg-bg text-ink hover:bg-line-2 flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-semibold motion-safe:transition-colors"
        >
          Filters
          {badge > 0 && (
            <span className="bg-ink rounded-[10px] px-1.5 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
        </Drawer.Trigger>
      </div>

      <Drawer.Root handle={filterDrawerHandle} swipeDirection="down" modal>
        <Drawer.Portal container={portalContainer}>
          <Drawer.Backdrop className="fixed inset-0 z-20 bg-black/35 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-safe:transition-opacity motion-safe:duration-300" />
          <Drawer.Viewport className="fixed inset-x-0 bottom-0 z-30">
            <Drawer.Popup className="bg-panel flex max-h-[88vh] flex-col rounded-t-2xl data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full motion-safe:transition-transform motion-safe:duration-300">
              <div className="shrink-0">
                <div className="bg-line mx-auto mt-2.5 h-1 w-9 rounded-full" />
                <Drawer.Title className="px-4 pt-3.5 text-[16px] font-bold">
                  Filters
                </Drawer.Title>
              </div>
              <Drawer.Content className="min-h-0 overflow-y-auto px-4 pt-4 pb-8">
                <FilterSections {...props} calendarMode="inline" />
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
