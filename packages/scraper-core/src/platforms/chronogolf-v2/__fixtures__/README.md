# Chronogolf V2 fixtures — The Willows Golf & Country Club

Real captured responses from the Chronogolf **V2** marketplace endpoint
(`/marketplace/v2/teetimes`), used to fixture-test the V2 parser and the
sequential page walk. Re-capturing on a shape change is the intended signal, not
a chore.

## Files

`the-willows-2026-07-17-page-<N>.json` — one page per request, the full response
exactly as Chronogolf returned it (every field kept, not just consumed ones, so a
shape drift surfaces as a failing test rather than silent data loss).

### Populated page — `page-1` (date `2026-07-17`)

Captured 3 days out from the capture date (2026-07-14), inside The Willows' 5-day
booking window, so the day is bookable. Its 15 open starts exercise the parser:

- **Three physical loops** appear under the one course — `Bridges`, `Lakes`, and
  `Xena` — confirming records must be attributed per loop (`course.name`), not per
  course.
- **A same-wall-clock start on two loops**: `15:10` (`start_time` `"15:10"`)
  appears on both `Bridges` and `Xena`, exercising the "two distinct records at
  one `startInstant`" case that the persistence key disambiguates by routing.
- **A spread of party sizes**: `min_player_size`/`max_player_size` of `{1,1}`
  (×10), `{1,2}` (×3), `{1,3}` (×1), and `{1,4}` (×1), exercising the inline
  contiguous `[min .. max]` group-size range.
- **`course.bookable_holes` is `[9, 18]`** on every start (the `18` course-id
  toggle is what unlocks the second hole count), exercising the 9/18 fan-out.
- **`default_price.bookable_holes` is `9`** on every row (the feed prices only the
  9-hole public green fee), so the 9-hole record carries `dynamicPrice` and the
  18-hole record carries `null`. `default_price.player_type_id` is `110161`
  (Public Adult), matching the course config's `affiliationTypeId`.

### Empty terminal page — `page-2-empty`

The first page whose `teetimes` array is `[]` (here `page=2`, with
`status: "sold_out"`), so the pagination stop condition is fixture-backed. The
parser keys off the empty `teetimes` array, not `status`.

## Re-capturing

Chronogolf's V2 endpoint is reachable by direct browser navigation to the JSON
URL (the same `PlaywrightJsonFetcher` → `HostLimitedJsonFetcher` transport V1
uses); it is not session-gated. A browser-like `User-Agent` is required.

```
GET https://www.chronogolf.ca/marketplace/v2/teetimes
  ?start_date=<YYYY-MM-DD>
  &course_ids=25664982-9496-4843-8b9d-581b981d698c,5fdf8123-a394-4533-aa03-ae11d9d60650,2e7ff0bb-4cc8-4b85-85be-2a4f9a2813d0,18
  &page=<N>
```

The three UUIDs are The Willows' physical loops (Bridges, Lakes, Xena); the
trailing `18` is the combined-round toggle that unlocks `bookable_holes: [9, 18]`
and injects no rows of its own. Walk `page=1,2,3…` until `teetimes` is empty; pick
a date inside the 5-day booking window with starts on multiple loops.
