# TeeOn fixtures — The Legends Golf Club (Warman)

Real captured guest `tee-time` JSON from the TeeOn portal, used to fixture-test
the TeeOn parser. Re-capturing on a shape change is the intended signal, not a
chore.

## Files

`the-legends-<date>.json` — one page per date: the full guest availability array
exactly as TeeOn returned it (nested `facility`/`course`/`turn_tee_time` objects
kept intact so a shape drift surfaces as a failing test, not silent data loss).

### Fan-out set — future date `2026-07-17` (a Friday)

Captured 4 days out from the capture date (2026-07-13), inside The Legends' 5-day
booking window, so the day is bookable. Its 9 open starts exercise the parser's
per-start fan-out:

- **5 starts carry an 18-hole continuation** (`turn_tee_time` present with a
  `turn_division_title` of `"Back"`) → both a 9-hole and an 18-hole record.
- **4 late-day starts lack `turn_tee_time`** (18:16–18:56 — too late for a back
  nine) → a 9-hole record only.
- `quantity_remaining` spans `1`, `2`, and `4`, exercising the contiguous
  `[1 .. min(quantity_remaining, 4)]` group-size range.

The guest feed only ever returns bookable rows (`blocked_type: "open"`,
`quantity_remaining >= 1`) — even a full day's real capture contains no
blocked/full rows — so the parser's drop guard is exercised by a modified row in
the parser tests rather than a live capture.

### Restricted single-booking set — `2026-07-15` (a Wednesday)

Three open starts (12:00, 14:24, 14:48) that expose a floor the `tee-time` feed
does **not** encode: a single booking is not always allowed. The facility's
`single_bookings` rule (from `guest/facility/settings/tee-sheet`, not this feed)
is `"allow_within_group"`, meaning a solo player may only join a partially-filled
group, never start a new one on an empty tee time. So the minimum group size is
derived per row from `quantity_remaining` vs `size`:

- `12:00` and `14:24` — `quantity_remaining: 1`, `size: 4` (3 already booked) →
  a single joins the existing group → **min 1** (TeeOn UI: "1 Player").
- `14:48` — `quantity_remaining: 4`, `size: 4` (empty) → a single would start a
  new group → disallowed → **min 2** (TeeOn UI: "2 - 4 Players").

The parser currently emits `[1 .. min(quantity_remaining, 4)]` for every row, so
it wrongly advertises a 1-player booking for `14:48`. Deriving the floor needs
both `size` (unmodeled today) and the facility `single_bookings` rule.

## Re-capturing

TeeOn's guest API is session-gated (its key is injected by the portal SPA; a
direct request returns `401`), so the JSON is captured by driving the portal
page, not requested directly:

1. Navigate a headless browser to the portal URL with the target date:
   `https://admin.teeon.com/portal/thelegendsgolfclub/teetimes/thelegendsgolfclub?date=<YYYY-MM-DD>`
2. Capture the response whose URL starts with
   `https://admin.teeon.com/api/2024-04/guest/tee-time?facility_id=477&date=<YYYY-MM-DD>`
   (facility `477`), which the SPA issues on load.

Pick a date inside the 5-day booking window that has both 18-hole starts and a
late-day 9-only start.
