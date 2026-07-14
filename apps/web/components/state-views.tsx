import { DESKTOP_GRID } from './desktop-tee-time-row';

function Bar({ width }: { width: string }) {
  return <div className="skeleton-bar h-3" style={{ width }} />;
}

const DESKTOP_SKELETON_WIDTHS: string[][] = [
  ['52px', '72%', '20px', '80px', '48px', '30px'],
  ['48px', '55%', '20px', '96px', '48px', '24px'],
  ['44px', '65%', '20px', '60px', '48px', '30px'],
  ['52px', '80%', '20px', '72px', '48px', '28px'],
  ['44px', '48%', '20px', '88px', '48px', '30px'],
  ['52px', '60%', '20px', '64px', '48px', '24px'],
  ['48px', '70%', '20px', '80px', '48px', '30px'],
];

/** Skeleton placeholder rows filling the desktop table body while loading. */
export function DesktopSkeletonRows() {
  return (
    <div aria-hidden>
      {DESKTOP_SKELETON_WIDTHS.map((widths, index) => (
        <div
          key={index}
          className={`${DESKTOP_GRID} min-h-[42px] items-center border-b border-line-2 bg-panel`}
        >
          {widths.map((width, cell) => (
            <div key={cell} className="flex items-center px-2.5 py-2.5">
              <Bar width={width} />
            </div>
          ))}
          <div className="flex items-center px-2.5 py-2">
            <div className="skeleton-bar h-[30px] w-full rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton placeholder rows filling the mobile list while loading. */
export function MobileSkeletonRows() {
  return (
    <div aria-hidden>
      {DESKTOP_SKELETON_WIDTHS.map((widths, index) => (
        <div
          key={index}
          className="grid grid-cols-[46px_1fr_58px] items-center gap-3 border-b border-line-2 bg-panel px-4 py-3"
        >
          <Bar width="40px" />
          <div className="flex flex-col gap-1.5">
            <Bar width={widths[1]!} />
            <Bar width="45%" />
          </div>
          <div className="skeleton-bar h-11 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function StateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center px-6 py-16">
      <div className="max-w-[320px] text-center">{children}</div>
    </div>
  );
}

interface EmptyStateProps {
  onReset: () => void;
}

/** Generic empty state — one message for both no-data and filters-too-narrow. */
export function EmptyState({ onReset }: EmptyStateProps) {
  return (
    <StateCard>
      <div className="text-4xl">⛳</div>
      <div className="mt-3 text-body-primary text-ink">No tee times found</div>
      <p className="mt-2 text-[13px] leading-normal text-ink-3">
        There&apos;s nothing available for this date with your current filters.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 text-[13px] text-ink-2 underline underline-offset-2"
      >
        Reset filters
      </button>
    </StateCard>
  );
}

interface ErrorStateProps {
  onRetry: () => void;
}

/** Error state shown when a date fetch fails. */
export function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <StateCard>
      <div className="mt-3 text-body-primary text-ink">Something went wrong</div>
      <p className="mt-2 text-[13px] leading-normal text-ink-3">
        Couldn&apos;t load tee times. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 mx-auto flex min-h-[36px] items-center justify-center rounded-md bg-accent px-4 text-[13px] font-semibold text-white hover:bg-accent-dark"
      >
        Try again
      </button>
    </StateCard>
  );
}
