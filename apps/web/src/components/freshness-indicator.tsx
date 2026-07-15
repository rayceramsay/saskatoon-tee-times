import type { FreshnessLevel, FreshnessState } from '../lib/derived.util';

const DOT_COLOR: Record<Exclude<FreshnessLevel, 'none'>, string> = {
  fresh: 'bg-status-fresh',
  amber: 'bg-status-amber',
  red: 'bg-status-red',
};

const TEXT_COLOR: Record<FreshnessLevel, string> = {
  fresh: 'text-status-fresh',
  amber: 'text-status-amber-text',
  red: 'text-status-red-text',
  none: 'text-ink-3',
};

interface FreshnessIndicatorProps {
  state: FreshnessState;
  loading?: boolean;
}

/**
 * The always-visible data-freshness signal: a coloured dot plus label, a loading
 * treatment while a date is in flight, or a dash when there is no timestamp.
 */
export function FreshnessIndicator({ state, loading }: FreshnessIndicatorProps) {
  if (loading) {
    return <span className="text-meta text-ink-3">Updating…</span>;
  }

  if (state.level === 'none') {
    return (
      <span className="text-meta text-ink-3" aria-label="Freshness unavailable">
        —
      </span>
    );
  }

  return (
    <span className={`text-meta flex items-center gap-1.5 ${TEXT_COLOR[state.level]}`}>
      <span
        className={`h-[7px] w-[7px] shrink-0 rounded-full ${DOT_COLOR[state.level]}`}
      />
      {state.label}
    </span>
  );
}
