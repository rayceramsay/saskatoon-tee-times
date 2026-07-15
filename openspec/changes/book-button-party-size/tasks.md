## 1. Book action label

- [ ] 1.1 In `apps/web/src/components/booking-action.tsx`, after the phone-only early return, compute the target party size as `players ?? slotMaxGroupSize(slot)` (importing `slotMaxGroupSize` from `../lib/derived.util`)
- [ ] 1.2 Render the visible link label as `Book for {size}` instead of the static "Book"
- [ ] 1.3 Include the party size in the `aria-label` (e.g. `Book for {size} at {time} at {course}`)

## 2. Verify

- [ ] 2.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors
- [ ] 2.2 Manually confirm: Players 1/2/3/4 renders "Book for N"; Players Any renders "Book for" the slot's max group size; phone-only slots still render "Call to book"
