# WebTrac fixtures — Saskatoon municipal courses

Real captured search-results HTML from the Saskatoon Leisure WebTrac portal,
used to fixture-test the WebTrac parser. Re-capturing on a markup change is the
intended signal, not a chore.

## Files

`<course>-<date>-<holes>h.html`, one page per course/hole-count.

### Online-bookable set — future date `2026-07-15` (a Wednesday)

Captured 7 days out from the capture date (2026-07-11), so online booking is
open and rows carry a `button success` add-to-cart `<a>` with a real
`addtocart.html` href:

- `holiday-park-championship-2026-07-15-{18,9}h.html` (`secondarycode=1`)
- `holiday-park-executive-9-2026-07-15-9h.html` (`secondarycode=2`)
- `silverwood-2026-07-15-{18,9}h.html` (`secondarycode=3`)
- `wildwood-2026-07-15-{18,9}h.html` (`secondarycode=4`)

`silverwood-2026-07-15-18h.html` additionally exercises the **drop** path: it
mixes online-bookable rows with `button error` rows whose tooltip reads "This
tee time does not have enough slots available…" — an error state that is *not*
"Individual Allowance Rules" and so is dropped rather than kept.

### Phone-only set — same day `2026-07-11`

- `holiday-park-championship-2026-07-11-18h.html` (`secondarycode=1`)

Every row is `button error` with `href="#"` and a `data-tooltip` containing
**"Individual Allowance Rules"** with `Open Slots > 0`. WebTrac opens online
booking 7 days ahead **excluding the current day**, so same-day slots are
genuinely available but phone-only: parsed as `onlineBookable: false` with empty
`bookingUrls`.

## Re-capturing

`GET https://leisure.saskatoon.ca/webtrac/web/search.html` with query params:

| Param                     | Value                                         |
| ------------------------- | --------------------------------------------- |
| `Action`                  | `Start`                                        |
| `SubAction`               | (empty)                                        |
| `secondarycode`           | course code (championship 1, executive-9 2, silverwood 3, wildwood 4) |
| `begindate`               | `MM/DD/YYYY`                                    |
| `begintime`               | `12:00 am`                                      |
| `numberofholes`           | `9` or `18`                                     |
| `numberofplayers`         | `1` (surfaces every slot regardless of open count) |
| `display`                 | `Detail`                                        |
| `module`                  | `GR`                                            |
| `multiselectlist_value`   | (empty)                                         |
| `grwebsearch_buttonsearch`| `yes`                                           |

No special headers are required. Rows live in
`table#grwebsearch_output_table tbody tr`; the cart `<a>` is the first cell,
labelled cells are addressed by `data-title` (`Course`/`Date`/`Time`/`Open
Slots`/`Holes`).
