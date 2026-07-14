## Context

The dashboard already scrapes Chronogolf **V1** for Greenbryre. The Willows books through Chronogolf's **V2** marketplace API (`/marketplace/v2/teetimes`), a different endpoint with a different payload contract. A months-old technical spike (`../saskatoon-tee-times/backend/src/scraping/chronogolf-v2`) proved feasibility and captured a real Willows response (`docs/samples/the_willows_response.json`), which was re-inspected to ground this design; the spike is a reference only, not a source to copy.

Key facts confirmed from the live capture:

- The endpoint is still reachable by direct browser navigation to the JSON URL — i.e. the existing `PlaywrightJsonFetcher` → `HostLimitedJsonFetcher` stack, the same transport V1 uses. It is **not** session-gated like TeeOn, so no captured-JSON transport is needed.
- The feed is **paginated** by a `page` query param; pages are walked until `teetimes` is empty.
- Each tee time carries its bookable party sizes **inline** as `min_player_size`/`max_player_size`, and its bookable hole counts inline as `course.bookable_holes` (`[9, 18]` for The Willows).
- `default_price.bookable_holes` is `9` for every row: only the 9-hole green fee is exposed.
- The Willows exposes three physical loops (Xena, Lakes, Bridges) under one course, and the same wall-clock start can appear on two loops (e.g. 7:03 on both Lakes and Xena).

The V2 API contract differs from V1 in ways that invert the scraper's shape, so V2 is a sibling adapter under `platforms/chronogolf-v2/`, not a modification of V1.

## Goals / Non-Goals

**Goals:**

- Add a `ChronogolfV2Scraper` that mirrors the existing platform-scraper structure (private richly-typed config, config-free `BookingPlatformScraper` surface, injected `JsonFetcher`, fixture-pinned parsing).
- Bring The Willows online with correct group sizes, hole-count fan-out, per-size deep links, and 9-hole pricing.
- Keep further V2 courses as configuration-only additions.

**Non-Goals:**

- No new transport, port, or limiter — the V2 endpoint reuses the existing browser `JsonFetcher` stack unchanged.
- No 18-hole pricing: the V2 feed does not expose it. Out of scope, accepted as a gap.
- No change to `ScrapedTeeTime`/`TeeTime`, the persistence key, or the orchestrator/pipeline.
- No V1 refactor to share code with V2 — the shapes differ enough that a shared abstraction would cost more than it saves.

## Decisions

### Sibling adapter under `platforms/chronogolf-v2/`, not a V1 extension

V1 and V2 differ in fan-out axis, availability signal, holes handling, pricing scope, and deep-link shape. Forcing them under one adapter would be a mess of conditionals. **Decision:** a standalone `platforms/chronogolf-v2/` package mirroring V1's file layout (`chronogolf-v2-scraper.adapter.ts`, `chronogolf-v2-course-config.ts`, `courses/the-willows.ts`, `__fixtures__/`). _Alternative considered:_ a shared `chronogolf-core` — rejected as premature; two courses on two API versions don't justify the abstraction yet.

### Sequential page walk inside the adapter

V2 pagination is inherently sequential — page N+1's existence is only known once page N returns non-empty — so unlike V1's `Promise.all` group-size fan-out, the page loop is a sequential `for` loop calling `fetcher.fetchJson(pageUrl(N))` until `teetimes` is empty. This fits the existing `JsonFetcher` port with no transport change. _Alternative considered:_ speculatively fetching several pages in parallel — rejected; it risks over-fetching empty pages and adds load to a rate-limited host for marginal latency gain on a small feed.

### Group sizes and holes come inline from the payload

V1 must query all four party sizes and merge to learn valid sizes; V2 states `[min_player_size .. max_player_size]` directly, so `groupSizes` is that contiguous range with **no per-size fan-out**. Holes fan out per tee time over `course.bookable_holes`: one 9-hole and one 18-hole record, both `routing: [course.name]`. The partner loop for an 18-hole round is not exposed by the API, so `routing` stays single-element (unlike WebTrac's `[Front, Back]`).

### Price attaches only to the hole count `default_price` covers

`default_price` is scoped to one hole count (`bookable_holes`, always `9` in the capture). `dynamicPrice` is set to `default_price.green_fee` only when `default_price.bookable_holes === record.holes`, else `null`. The pricing engine grosses the 9-hole pre-tax fee up by `0.11`; the 18-hole record resolves to `pricePerPlayer: null`.

### The `18` courseId is a toggle, not a row source

The Willows' `courseIds` are the three physical-loop UUIDs **plus** a literal `18`. The capture confirms every row is attributed to a physical loop (Xena/Lakes/Bridges) with unique tee-time ids; nothing is attributed to `18`. Its role is to make each start return `bookable_holes: [9, 18]` rather than `[9]` — it unlocks the 18-hole option and injects **no** rows. Therefore the parser needs **no** deduplication step; it trusts the feed's unique tee-time ids. This is captured as a config comment and a fixture-backed test, not special-case parsing code.

### Per-size deep links built at scrape time

The spike deferred player-count personalization to serve time; v4's convention (per V1) is to bake a per-group-size deep link into `bookingUrls` up front. The V2 deep link is `…/club/<slug>/booking/#/teetime/review?affiliation_type_ids=<id×players>&teetime_id=<id>&nb_holes=<holes>&engine=2` — it omits V1's `date`/`course_id` and appends `engine=2`. `bestBookingUrl(deepLink, config.bookingPortalUrl)` selects it over the portal fallback.

## Risks / Trade-offs

- **[The `18` toggle changes behavior or the feed starts emitting `18`-attributed rows]** → Parsing keys off each row's unique tee-time id, so even if `18` began producing rows they would carry distinct ids; a duplicate-id or missing-18h regression would surface against the committed fixture.
- **[Same-time starts on different loops collide in storage]** → The persistence sort key is `courseId#startInstant#holes#routing`; routing carries the loop name, and a single loop physically cannot have two same-minute tee-offs, so `…#9#Lakes` and `…#9#Xena` stay distinct. Covered by an explicit parser test asserting two distinct records at one `startInstant`.
- **[V2 payload shape drifts]** → Zod schema validates only consumed fields against a committed fixture; a shape change fails a test rather than silently dropping data.
- **[18-hole rounds show no price]** → Accepted, documented gap; the feed does not expose an 18-hole fee. If a future capture reveals an 18-hole price line, the parser's price-attachment rule is the single place to extend.
- **[Stale spike constants (UUIDs / affiliationTypeId / booking window)]** → Re-verified against the live capture and confirmed with the requester (affiliationTypeId unchanged; window 5 days / `07:00`). A fresh fixture is captured as the first implementation task.

## Open Questions

None outstanding — the `18`-alias behavior, pricing gap, transport, and booking window were all resolved during exploration against the live capture.
