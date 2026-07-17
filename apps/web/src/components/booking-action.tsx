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
 * The row's booking affordance, chosen by the slot's booking kind: a "Book for N"
 * deep link, a "Visit site" link to the course's booking portal, or a
 * non-interactive "Call to book" label for phone-only slots.
 */
export function BookingAction({ slot, players, variant }: BookingActionProps) {
  const time = format12Hour(startLocalTime(slot.startInstant));
  const sizing =
    variant === 'mobile'
      ? 'min-h-[44px] rounded-lg text-[11px]'
      : 'min-h-[30px] rounded-md text-xs';
  const linkClassName = `bg-accent hover:bg-accent-dark focus-visible:outline-accent flex w-full items-center justify-center font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-colors ${sizing}`;

  switch (slot.booking.kind) {
    case 'reservation': {
      const bookingSize = players ?? slotMaxGroupSize(slot);
      const href = bookingUrlFor(slot, slot.booking.urls, players);

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Book for ${bookingSize} players at ${time} at ${slot.courseName}`}
          className={linkClassName}
        >
          Book for {bookingSize}
        </a>
      );
    }
    case 'portal':
      return (
        <a
          href={slot.booking.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit ${slot.courseName}'s booking site to find the ${time} tee time`}
          className={linkClassName}
        >
          Visit site
        </a>
      );
    case 'phone':
      return (
        <span className="text-meta text-ink-2 whitespace-nowrap">Call to book</span>
      );
  }
}
