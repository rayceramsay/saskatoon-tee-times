import { startLocalTime } from '../lib/course-local-time.util';
import { bookingUrlFor, slotMaxGroupSize } from '../lib/derived.util';
import { format12Hour } from '../lib/format.util';
import type { TeeTime } from '../lib/tee-time-response.schema';

interface BookingActionProps {
  slot: TeeTime;
  players: number | null;
  variant: 'desktop' | 'mobile';
}

/**
 * The row's booking affordance: a "Book for N" link that opens the course portal
 * in a new tab, or a non-interactive "Call to book" label for phone-only slots.
 */
export function BookingAction({ slot, players, variant }: BookingActionProps) {
  const href = bookingUrlFor(slot, players);

  if (!slot.onlineBookable || href === undefined) {
    return <span className="text-meta text-ink-2 whitespace-nowrap">Call to book</span>;
  }

  const bookingSize = players ?? slotMaxGroupSize(slot);
  const label = `Book for ${bookingSize} players at ${format12Hour(startLocalTime(slot.startInstant))} at ${slot.courseName}`;
  const sizing =
    variant === 'mobile'
      ? 'min-h-[44px] rounded-lg text-[11px]'
      : 'min-h-[30px] rounded-md text-xs';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`bg-accent hover:bg-accent-dark focus-visible:outline-accent flex w-full items-center justify-center font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 ${sizing}`}
    >
      Book for {bookingSize}
    </a>
  );
}
