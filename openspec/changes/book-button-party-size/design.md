## Context

`BookingAction` (`apps/web/src/components/booking-action.tsx`) renders either a "Book" link or a "Call to book" label. It already receives `players: number | null` (null = Any) and computes the target URL via `bookingUrlFor(slot, players)`, which internally resolves the target size as `players ?? slotMaxGroupSize(slot)`. The visible label is a hardcoded "Book". The list feeding these rows is pre-filtered so that, when `players` is set, every visible slot's `groupSizes` includes that value (`apply-view.util.ts`), meaning the selected size is always genuinely bookable.

## Goals / Non-Goals

**Goals:**

- Show the party size each Book link targets in both the visible label ("Book for N") and the accessible label.
- Keep the displayed number provably consistent with the size the resolved URL targets.

**Non-Goals:**

- No change to booking-URL resolution, the Players filter, phone-only slots, or any data model.
- No new tests.

## Decisions

- **Derive the displayed size from `players ?? slotMaxGroupSize(slot)` in the component**, the same expression `bookingUrlFor` uses internally. This guarantees the shown number matches the size the link targets without threading a value out of `bookingUrlFor`. Alternative considered: have `bookingUrlFor` return `{ url, size }`. Rejected as over-engineering for a one-line expression that is already trivially reused and covered by the Players-filter membership guarantee.
- **Compute the size only on the bookable path**, after the phone-only early return, so "Call to book" is untouched.
- **Fold the size into the existing `aria-label`** (currently "Book {time} at {course}") as "Book for {N} at {time} at {course}", keeping visible and accessible labels in sync.

## Risks / Trade-offs

- [When the exact selected size lacks a dedicated URL, `bookingUrlFor` falls back to the max-size portal URL while the label still shows the selected N] → Correct by intent: the golfer asked to book for N and the list guarantees the slot supports N; the label reflects the requested party size, not the fallback URL's granularity.
