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
    <div className="border-line-2 bg-panel grid grid-cols-[46px_1fr_70px] items-center gap-3 border-b px-3 py-3">
      <div>
        <span className="text-display-time text-ink">{time}</span>
        <span className="text-ink-2 mt-[3px] block text-[10px] font-semibold">
          {ampm}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-body-primary text-ink">{slot.courseName}</div>
        <div className="text-meta text-ink-2 mt-[3px]">
          <span className="text-ink font-semibold">{slot.holes} holes</span>
          {routing !== null && (
            <>
              <span className="text-ink-3 mx-1">·</span>
              {routing}
            </>
          )}
        </div>
        <div className="text-meta text-ink-2 mt-0.5">
          <span>up to {slotMaxGroupSize(slot)}</span>
          {price !== null && (
            <>
              <span className="text-ink-3 mx-1">·</span>
              <span className="text-ink font-bold">{price}</span>
            </>
          )}
        </div>
      </div>
      <BookingAction slot={slot} players={players} variant="mobile" />
    </div>
  );
}
