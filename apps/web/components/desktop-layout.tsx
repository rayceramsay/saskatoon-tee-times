import type { CourseGroup } from '../lib/apply-view.util';
import { freshnessState, teeTimeKey } from '../lib/derived.util';
import { courseSummary, formatDateSummary } from '../lib/format.util';
import { FilterSections } from './filters';
import { DESKTOP_GRID, DesktopTeeTimeRow } from './desktop-tee-time-row';
import { FreshnessIndicator } from './freshness-indicator';
import type { LayoutProps } from './layout-props';
import { DesktopSkeletonRows, EmptyState, ErrorState } from './state-views';

const COLUMN_HEADERS = ['Time', 'Course', 'Holes', 'Routing', 'Slots', 'Price', ''];

function latestScrapedAt(group: CourseGroup): string {
  return group.teeTimes.reduce(
    (latest, teeTime) => (teeTime.scrapedAt > latest ? teeTime.scrapedAt : latest),
    group.teeTimes[0]!.scrapedAt
  );
}

function GroupHeader({ group, now }: { group: CourseGroup; now: Date }) {
  const freshness = freshnessState(latestScrapedAt(group), now);
  return (
    <div className="flex items-center gap-2.5 border-y border-line bg-bg px-2.5 py-[7px]">
      <span className="flex-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-2">
        {group.name}
      </span>
      <span className="text-[11px] text-ink-3">{group.teeTimes.length} tee times</span>
      <FreshnessIndicator state={freshness} />
    </div>
  );
}

/** The desktop dashboard: 264px filter sidebar + scrollable listings table. */
export function DesktopLayout(props: LayoutProps) {
  const {
    viewState,
    displayedDate,
    result,
    status,
    listingPending,
    freshness,
    freshnessLoading,
    now,
  } = props;
  const showPending = status === 'ready' && listingPending;
  const count = result.teeTimes.length;
  const summary = `${count} tee times · ${courseSummary(viewState.courses, props.courses)} · ${formatDateSummary(
    displayedDate
  )}`;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-[50px] shrink-0 items-center gap-4 border-b border-line bg-panel px-5">
        <span className="text-[15px] font-bold">Saskatoon Tee Times</span>
        <span className="flex-1" />
        <FreshnessIndicator state={freshness} loading={freshnessLoading} />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[264px] shrink-0 overflow-visible border-r border-line bg-panel p-3.5">
          <FilterSections {...props} calendarMode="popup" />
        </aside>

        <section
          id="listings"
          aria-label={`Tee times for ${formatDateSummary(displayedDate)}`}
          aria-busy={status === 'skeleton' || showPending}
          className="flex-1 overflow-auto bg-bg"
        >
          {/* The 612px min-width is just the sum of all column tracks (84+120+52+118+80+62+96) */}
          <div
            className={`min-w-[612px] ${showPending ? 'not-motion-safe:opacity-60 motion-safe:animate-pulse' : ''}`}
          >
            <div className="sticky top-0 z-10">
              <div
                role="status"
                aria-live="polite"
                className="border-b border-line-2 bg-bg px-4 py-1.5 text-meta text-ink-3"
              >
                {status === 'ready' ? summary : ' '}
              </div>
              <div className={`${DESKTOP_GRID} border-b border-line bg-panel`}>
                {COLUMN_HEADERS.map((header, index) => (
                  <div
                    key={index}
                    className="border-r border-line-2 px-2.5 py-2.5 text-label-caps uppercase tracking-[0.06em] text-ink-3 last:border-r-0"
                  >
                    {header}
                  </div>
                ))}
              </div>
            </div>

            {status === 'skeleton' && <DesktopSkeletonRows />}
            {status === 'error' && <ErrorState onRetry={props.onRetry} />}
            {status === 'ready' && count === 0 && (
              <EmptyState onReset={props.onReset} />
            )}
            {status === 'ready' && count > 0 && result.groups === null && (
              <div>
                {result.teeTimes.map((slot) => (
                  <DesktopTeeTimeRow
                    key={teeTimeKey(slot)}
                    slot={slot}
                    players={viewState.players}
                  />
                ))}
              </div>
            )}
            {status === 'ready' && count > 0 && result.groups !== null && (
              <div>
                {result.groups.map((group) => (
                  <div key={group.id}>
                    <GroupHeader group={group} now={now} />
                    {group.teeTimes.map((slot) => (
                      <DesktopTeeTimeRow
                        key={teeTimeKey(slot)}
                        slot={slot}
                        players={viewState.players}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
