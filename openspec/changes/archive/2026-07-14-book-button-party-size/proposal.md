## Why

The "Book" button gives no indication of how many players its link is set to book for, so a golfer can't tell at a glance whether opening it will land them on a booking flow for their intended party size. Surfacing the size makes the button's behaviour self-evident and reinforces what the Players filter is doing.

## What Changes

- Replace the static "Book" label with "Book for N", where N is the party size the link targets:
  - When the Players filter is `1|2|3|4`, N is that selected value.
  - When Players is `Any`, N is the slot's maximum available group size (`slotMaxGroupSize`).
- Update the Book action's accessible label to include the party size.
- Phone-only slots (`onlineBookable: false`) are unchanged — they keep the non-interactive "Call to book" label.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `tee-time-dashboard`: The "Booking action and phone-only slots" requirement changes so the Book action's visible label and accessible label name the party size the link targets, rather than a static "Book".

## Impact

- `apps/web/src/components/booking-action.tsx` — the only code change: derive the displayed size from the existing `players ?? slotMaxGroupSize(slot)` expression (the same one `bookingUrlFor` uses) and render "Book for N" plus an updated `aria-label`.
- No API, data model, or booking-URL behaviour changes; the resolved URL is identical. No new tests required.
