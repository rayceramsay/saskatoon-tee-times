import { clockParts, formatPrice } from '../lib/format.util';
import { slotMaxGroupSize } from '../lib/derived.util';
import type { TeeTime } from '../lib/tee-time-response.schema';
import { BookingAction } from './booking-action';

interface MobileTeeTimeRowProps {
  slot: TeeTime;
  players: number | null;
}

/** A single tee time as a mobile three-zone row (`46px 1fr 58px`). */
export function MobileTeeTimeRow({ slot, players }: MobileTeeTimeRowProps) {
  const { time, ampm } = clockParts(slot.startInstant);
  const routing = slot.routing.length > 0 ? slot.routing.join(' + ') : null;
  const price = slot.pricePerPlayer !== null ? formatPrice(slot.pricePerPlayer) : null;

  return (
    <div className="grid grid-cols-[46px_1fr_58px] items-center gap-3 border-b border-line-2 bg-panel px-4 py-3">
      <div>
        <span className="text-display-time text-ink">{time}</span>
        <span className="mt-[3px] block text-[10px] font-semibold text-ink-2">
          {ampm}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-body-primary text-ink">{slot.courseName}</div>
        <div className="mt-[3px] text-meta text-ink-2">
          <span className="font-semibold text-ink">{slot.holes} holes</span>
          {routing !== null && (
            <>
              <span className="mx-1 text-ink-3">·</span>
              {routing}
            </>
          )}
        </div>
        <div className="mt-0.5 text-meta text-ink-2">
          <span>up to {slotMaxGroupSize(slot)}</span>
          {price !== null && (
            <>
              <span className="mx-1 text-ink-3">·</span>
              <span className="font-bold text-ink">{price}</span>
            </>
          )}
        </div>
      </div>
      <BookingAction slot={slot} players={players} variant="mobile" />
    </div>
  );
}
