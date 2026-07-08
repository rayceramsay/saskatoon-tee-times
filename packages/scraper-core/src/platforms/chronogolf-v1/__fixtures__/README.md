# Chronogolf V1 fixtures — Greenbryre

Real captured responses from the Chronogolf V1 tee-times endpoint, used to
fixture-test `parseResponse` and `mergeListing`. Re-capturing on a shape change
is the intended signal, not a chore.

## Coherent set — main course (`course_id` 2020), date `2026-07-11`

`greenbryre-2020-{12,6}h-{1,2,3,4}p.json` — both hole variants across all four
group sizes, all on one date, so they merge into a coherent listing. This set
exercises the merge cases: non-contiguous `[2,3,4]` (single-restricted empty
tees), fully-booked slots dropped, and present/null `dynamicPrice`.

## Re-capturing

`GET https://www.chronogolf.ca/marketplace/clubs/1743/teetimes` with
`date`, `course_id=2020`, `affiliation_type_ids[]=7689` repeated once per player
(1–4), and `nb_holes` (6 or 12). A browser-like `User-Agent` header is required —
the default request user agent is blocked by Cloudflare (UA filtering, not a JS
challenge).
