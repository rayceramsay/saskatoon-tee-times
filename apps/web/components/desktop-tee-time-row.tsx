import { clockParts, formatPrice } from '../lib/format.util';
import { slotMaxGroupSize } from '../lib/derived.util';
import type { TeeTime } from '../lib/tee-time-response.schema';
import { BookingAction } from './booking-action';

/**
 * The 7-column grid shared by the desktop header and every desktop row. The
 * Course column uses a fixed `120px` floor rather than a bare `1fr` so its track
 * size never depends on cell content, keeping every grid instance aligned.
 */
export const DESKTOP_GRID =
  'grid grid-cols-[84px_minmax(120px,1fr)_52px_118px_80px_62px_96px]';

const CELL = 'flex items-center px-2.5 py-2.5 border-r border-line-2 last:border-r-0';

function NotAvailable() {
  return (
    <span className="text-ink-3" aria-label="Not available">
      —
    </span>
  );
}

interface DesktopTeeTimeRowProps {
  slot: TeeTime;
  players: number | null;
}

/** A single tee time as a desktop table row across the 7-column grid. */
export function DesktopTeeTimeRow({ slot, players }: DesktopTeeTimeRowProps) {
  const { time, ampm } = clockParts(slot.startInstant);
  const routing = slot.routing.length > 0 ? slot.routing.join(' + ') : null;
  const price = slot.pricePerPlayer !== null ? formatPrice(slot.pricePerPlayer) : null;

  return (
    <div
      className={`${DESKTOP_GRID} min-h-[42px] items-center border-b border-line-2 bg-panel hover:bg-panel-hover`}
    >
      <div className={`${CELL} whitespace-nowrap`}>
        <span className="text-[14px] font-bold tracking-[-0.2px] text-ink">{time}</span>
        <span className="ml-0.5 text-[10px] font-semibold text-ink-3">{ampm}</span>
      </div>
      <div className={`${CELL} text-body-primary leading-snug text-ink`}>
        {slot.courseName}
      </div>
      <div className={`${CELL} text-body-secondary text-ink-2`}>{slot.holes}</div>
      <div className={`${CELL} text-meta text-ink-3`}>
        {routing ?? <NotAvailable />}
      </div>
      <div className={`${CELL} text-meta text-ink-2`}>
        Up to {slotMaxGroupSize(slot)}
      </div>
      <div className={`${CELL} text-body-secondary`}>
        {price !== null ? (
          <span className="font-bold text-ink">{price}</span>
        ) : (
          <NotAvailable />
        )}
      </div>
      <div className="flex items-center px-2.5 py-2">
        <BookingAction slot={slot} players={players} variant="desktop" />
      </div>
    </div>
  );
}
