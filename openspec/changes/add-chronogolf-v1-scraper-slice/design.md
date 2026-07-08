## Context

Saskatoon Tee Times scrapes public tee-time availability from every Saskatoon-area course and serves it as one unified, filterable dashboard. Courses do not run their own booking backends — they outsource to a handful of third-party **booking platforms** (Webtrac, Chronogolf V1, Chronogolf V2, TeeOn), and multiple courses share a platform. Scraping logic therefore differs per **platform**, while an individual **course is just configuration** passed to its platform's scraper.

`packages/scraper-core` is the package that holds this scraping logic; the scraper apps (`scraper-lambda`, `scraper-local`) and, indirectly, the API depend on it. Current state: `scraper-core` has only `package.json` (deps: `cheerio`, `playwright-core`, `zod`) — no `tsconfig`, no `src/`, no test runner. Every downstream app is an empty shell. This is first-line-of-code.

**Target architecture (the whole pipeline this slice is the front of).** Ingestion is a staged pipeline whose stages are injected and independently testable:

```
per-platform scraper  ──▶ ScrapedTeeTime[] ──enrich──▶ TeeTime[] ──▶ persist / API
  fetch → parse           (raw price)      (pricing)  (final price)
  (+ merge, if needed)     THE SEAM         engine      repository
```

- **Scrapers** (per platform) turn a `(course, date)` unit into normalized `ScrapedTeeTime[]`. The universal internal shape is **fetch → parse**; a scraper additionally **merges** across multiple queries only when the platform forces it (confirmed necessary for Chronogolf V1 — see its group-size decision; unknown whether the other platforms need it). A unit is **not** one request — a scraper may fan out over sub-courses, hole variants, and group sizes internally; how many HTTP calls a unit costs is private to the scraper.
- The **canonical schema is the seam** between platform-specific code (everything left of it, written once per platform) and platform-agnostic code (everything right of it, written once, blind to origin).
- The **pricing engine** later enriches `ScrapedTeeTime` (raw scraped price) into `TeeTime` (final after-tax `pricePerPlayer`).
- An **orchestrator** fans out all `(course, date)` units in parallel, isolating per-unit failures, and a **per-host rate limiter** paces requests politely.

This change implements only the **first vertical slice**: one platform (Chronogolf V1), one course (Greenbryre), one date, producing correct `ScrapedTeeTime[]` in memory. It proves the abstraction end-to-end on the simplest platform (Chronogolf returns JSON) before investing in HTML scraping, rate limiting, orchestration, and pricing. It stops at "produce `ScrapedTeeTime[]` in memory."

## Goals / Non-Goals

**Goals:**

- Prove `fetch → parse → merge → ScrapedTeeTime[]` on Chronogolf V1 for Greenbryre, producing correct availability and group sizes.
- Lay down the `BookingPlatformScraper` interface as the north-star contract the orchestrator will later consume, with the concrete `ChronogolfV1Scraper` implementing it.
- Establish the canonical scraped-tee-time schema (left of the pricing seam) as Zod schemas with inferred types.
- Make `parse` and `merge` pure, fixture-tested functions so silent JSON drift or a semantics change surfaces as a red test.
- Scaffold `scraper-core` to match monorepo conventions (`@stt/typescript-config`, `@stt/eslint-config`, Vitest).

**Non-Goals (deferred to later changes):**

- Per-host rate limiter / shared HTTP client — naive `fetch` for now.
- Booking-window logic (which dates are bookable per course) — the date is an input to `scrape`.
- Orchestrator, failure isolation, parallel fan-out across `(course, date)` units.
- Pricing engine, the `ScrapedTeeTime → TeeTime` seam, tax normalization.
- Booking-URL deep-linking (the more specific rungs); all other platforms and courses.
- Extracting a shared `domain` package; the canonical schema stays in `scraper-core` until the API actually needs it.

## Decisions

### Separate three responsibilities that want to live in three different places

The architecture keeps three concerns distinct, because conflating them (especially "where does rate limiting go?") is the main source of confusion:

1. **Platform mechanics** — "how do I fetch + parse this platform?" → per platform (the scraper).
2. **Network politeness** — "may I hit this server right now?" → per **origin/host** (a rate limiter), because the limit lives on the remote server keyed by the origin you hit, not on the scraper.
3. **Orchestration** — "run all work, isolate failures" → global, platform-agnostic.

This slice implements only #1 (for one platform). #2 and #3 are deferred, but the scraper is written so they slot in without a rewrite (see naive-fetch decision).

### `BookingPlatformScraper`: config-free surface, private typed config — laid down up front

The orchestrator must hold a heterogeneous list of scrapers without their per-platform config types leaking into it. So the contract is config-free, and each scraper owns its rich typed config privately:

```ts
// Universal course facts, independent of platform — every platform's course
// config extends this. Not "what the orchestrator needs" but "what is true of
// a course regardless of who books it." Timezone is per-course config, never
// inferred from the runtime (Lambda runs in UTC; future courses may differ).
interface CourseBookingConfig {
  courseId: CourseId;
  courseName: string;
  timeZone: string;         // IANA id, e.g. "America/Regina"
  bookingPortalUrl: string; // rung-3 booking fallback — every course has one, consumed now
  // Booking-window facts (maxAdvanceDays, releaseTime) are equally universal and
  // will join here when the orchestrator's booking-window stage is built —
  // omitted now only because nothing consumes them yet.
}

// What the orchestrator consumes. No generics.
interface BookingPlatformScraper {
  readonly platform: PlatformId;
  readonly courses: readonly CourseBookingConfig[];
  scrape(courseId: CourseId, date: string): Promise<ScrapedTeeTime[]>;
}

class ChronogolfV1Scraper implements BookingPlatformScraper {
  constructor(private readonly configs: readonly ChronogolfV1CourseConfig[]) {}
  readonly platform = 'chronogolf-v1';
  get courses() { return this.configs; } // ChronogolfV1CourseConfig extends CourseBookingConfig
  async scrape(courseId, date) { /* fan out + parse + merge; typed config resolved by id */ }
}
```

Only `ChronogolfV1Scraper` exists this slice, but we define the interface now: it is cheap, it is the seam the orchestrator will depend on, and it forces the concrete class to expose a config-free surface from day one. Alternative considered — write the concrete class alone and extract the interface when a second scraper appears — rejected by explicit request; the contract is wanted as a north star. The interface is shaped by the known needs of all four platforms, so over-fitting to Chronogolf is a low risk.

### Two schemas because a transform that changes the meaning of the data should change its type — this slice defines only the first

The pipeline has an internal representation (`ScrapedTeeTime`, price maybe raw/unresolved) and a public one (`TeeTime`, price finalized). Keeping them as distinct types makes the seam a compiler-enforced boundary: the API can only handle `TeeTime`, so it cannot accidentally serve an un-priced slot or read the raw internal price. This slice defines **only the left side**; `TeeTime` is not created until there is a pricing engine to produce it (fabricating the right side early would be a lie).

```ts
// The only bookable party sizes across in-scope courses. A closed union, not
// `number`, so group-size maps stay exhaustive and typos fail to compile.
type GroupSize = 1 | 2 | 3 | 4;

interface BaseTeeTime {
  startInstant: string; // ISO 8601 instant WITH the course's local UTC offset (never UTC)
  courseId: CourseId;
  courseName: string;
  holes: number;                  // hole COUNT — sourced from the nb_holes request param, not the response
  routing: string[];              // ordered set names, e.g. ["North"]; [] if unknown
  groupSizes: GroupSize[];        // explicit valid sizes, NOT assumed contiguous — e.g. [2,3,4]
  bookingUrls: Partial<Record<GroupSize, string>>; // best URL per valid group size
  scrapedAt: string;              // ISO 8601 instant (UTC) of the scrape
}

interface ScrapedTeeTime extends BaseTeeTime {
  dynamicPrice: number | null;    // RAW per-player price as scraped; null = platform gave none. Tax
                                  // status is a per-course config fact resolved later, NOT known here.
}
```

Each schema is a Zod schema with an inferred TS type. `startInstant` always carries the course's local offset — the calendar date/time is local to the course, never UTC — computed from the course's configured `timeZone`. (All in-scope courses are `America/Regina`, fixed UTC−06:00, but nothing hard-codes that.)

### Chronogolf V1 request/response contract (empirically grounded)

**Request** — a JSON GET against the configured mirror:

```
GET https://www.chronogolf.{tld}/marketplace/clubs/{clubId}/teetimes
  ?date={YYYY-MM-DD}
  &course_id={chronogolfCourseId}
  &affiliation_type_ids[]={affiliationId}   // repeated once PER PLAYER (1–4 times)
  &nb_holes={6|12}
```

For Greenbryre: `tld=ca`, `clubId=1743`, `affiliationId=7689`.

**Response** — a JSON array of tee-time objects. Fields that matter:

| Field | Meaning |
| --- | --- |
| `id` | Stable tee-time id — the merge key across group-size queries |
| `start_time` | Local `HH:mm` (e.g. `"06:00"`) — combined with `date` + course offset → `startInstant` |
| `date` | `YYYY-MM-DD`, local |
| `hole` | The *starting* hole (always `1` here) — **NOT** the hole count |
| `restrictions` | Array of restriction strings; empty when none apply **to the queried group size** |
| `out_of_capacity` | `true` = slot can't fit the queried party (fully booked / no room) |
| `green_fees[0].green_fee` | Raw per-player price for the queried affiliation; absent when not bookable at that size |

**Hole count is not in the response** — the response `hole` field is the starting hole. `holes` is sourced from the `nb_holes` request param, so `parse` must be told it.

### Group sizes come from querying every size and merging — restrictions are per-query

Chronogolf reveals a slot's valid party sizes only by asking. Two signals, both **relative to the queried group size**:

- `out_of_capacity: true` → the queried party does not fit (full).
- a `restrictions` entry (e.g. the single-player-on-empty-tee rule) → the queried size is disallowed. Crucially, **the restriction appears only in a query at a size it applies to** — the same slot queried at size 4 comes back unrestricted, and at size 1 comes back restricted. So you cannot infer sizes from one query; you must ask each size.

**Bookable at size G** ⇔ in the size-G query the slot has `out_of_capacity == false` **and** `restrictions == []`. The **merge** collects, per tee-time `id`, the set of G for which it was bookable → `groupSizes`. This naturally yields non-contiguous arrays (`[2,3,4]` for an empty tee where singles are barred; `[1]` for a tee with one seat left). A slot bookable at no size is dropped. Price is taken from `green_fees[0].green_fee` of any bookable query (per-player, size-independent). `green_fee` is **pre-tax** (known from the spike) — captured raw into `dynamicPrice` here; the future pricing engine's per-course tax config is what normalizes it to an after-tax price.

### A Greenbryre "unit" fans out over sub-courses × hole variants × group sizes

One `scrape("greenbryre", date)` is an internal fan-out, then a merge. Greenbryre's fan-out matrix:

| `chronogolfCourseId` | `nb_holes` | group sizes | `routing` | notes |
| --- | --- | --- | --- | --- |
| `2020` | `12` | 1,2,3,4 | `[]` | main course, no known routing |
| `2020` | `6` | 1,2,3,4 | `[]` | main course, 6-hole |
| `26895` | `6` | 1,2,3,4 | `["North"]` | North set — exclusive "early-bird 6-hole" listing |

= **12 requests** per date, merged into one `ScrapedTeeTime[]`. Each `(chronogolfCourseId, nb_holes, routing)` triple is a **listing** in config; group sizes `[1,2,3,4]` are a constant. Merge is scoped **within** a listing (by tee-time `id`); listings are concatenated (different `nb_holes` or `course_id` are genuinely different bookable products, even at the same `start_time`). `holes` = the listing's `nb_holes`; `routing` = the listing's routing.

```ts
interface ChronogolfV1Listing {
  chronogolfCourseId: number; // 2020 | 26895
  nbHoles: number;            // 6 | 12 → ScrapedTeeTime.holes
  routing: string[];          // [] | ["North"]
}

interface ChronogolfV1CourseConfig extends CourseBookingConfig {
  tld: string;                // "ca" — platform mirror
  clubId: number;             // 1743
  affiliationTypeId: number;  // 7689
  listings: ChronogolfV1Listing[];
}
```

### `fetch → parse → merge` split — `parse` and `merge` are pure and fixture-tested

The split is the testability story:

- `parseResponse(json)` — pure `bytes → RawChronogolfTeeTime[]`, Zod-validating the raw platform shape. No I/O.
- `mergeListing(listing, responsesByGroupSize, config, date)` — pure; applies the bookable-at-G rule across the four group-size responses and emits `ScrapedTeeTime[]` for that listing.
- `scrape` — the thin I/O shell: builds the fan-out matrix from config, `fetch`es each `(listing, groupSize)`, then delegates to `parseResponse` + `mergeListing` and concatenates.

Fixtures (captured real responses) are committed and drive the tests, so a course changing its response shape or a semantics shift surfaces as a red test — not silent data loss. CI runs the pure tests only; no live-site calls in CI.

### Naive `fetch`, no rate limiter — but isolated so the seam slots in later

`scrape` calls `fetch` directly against the configured mirror. The per-host rate-limiter/HTTP-client seam is deferred: 12 requests for one course on one date will not trip limits, and building a throttle before observing a real 429 is premature — the value later is the *seam*, not a sophisticated token bucket. Concurrency is decoupled from politeness in the target design (the orchestrator fans out everything; a per-host gateway is the single choke point), so the throttle is a shared dependency, not scraper logic. Keeping `fetch` behind the scraper means introducing an injected HTTP client later is a constructor change, not a rewrite.

### Chronogolf serves identical data under many TLD mirrors — pin the course to one via config

Chronogolf mirrors the same backend under `chronogolf.com`, `.ca`, `.ie`, etc., and rate-limits **each origin independently**. That is a deliberate rate-limit lever for later (spreading multiple Chronogolf courses across distinct mirrors gives each its own budget, since a future per-host limiter keys by hostname). For this single-course slice it only means the request URL is built as `chronogolf.${tld}` where `tld` is per-course config; Greenbryre is pinned to `ca`.

### Booking URLs: a specificity ladder built per platform inside `parse` — rung 3 only this slice

The goal is to serve the closest thing to a reservation URL per group size:

```
1. tee-time-specific checkout URL   (most direct; only if the response carries it)
2. booking portal, date-filtered     (templated from portal URL + known date)
3. general booking portal            (a per-course constant — always available)
```

Chronogolf V1 carries **no** per-tee-time deep link in its response, so rung 1 is unavailable here regardless. This slice emits **only rung 3** — the per-course `bookingPortalUrl` — mapped to every valid group size. The only shared piece is a trivial "pick the first available candidate" policy, introduced now with a single candidate:

```ts
const bestBookingUrl = (...candidates: (string | null | undefined)[]) =>
  candidates.find((c) => c != null)!; // rung 3 guarantees a value
```

Because rung 3 always resolves, `bookingUrls` never has a null case (unlike price). Rung 2 (date-filtered portal) is added when deep-linking is tackled.

### Assume Chronogolf-over-`fetch` works; the first live run confirms it

A prior spike drove Chronogolf through a browser for uniform convenience, but plain `fetch` is believed to return the same JSON. Per the user we proceed on ~95% confidence. The first real `scrape` run (task 5.x) is the empirical confirmation. If a browser turns out to be required (bot protection), the fix is isolated to this one class — it would gain a browser-based auth/session step while `parseResponse`/`mergeListing` stay unchanged.

## Risks / Trade-offs

- **Chronogolf may require a browser (bot protection)** → Isolated to `ChronogolfV1Scraper`; the first live run confirms or refutes it. If refuted, restructure only the I/O shell; the pure parse/merge and the schema are unaffected.
- **Fixture drift / staleness** → Captured fixtures can go stale vs. the live response shape; accepted for a slice. A failing test on refresh is the *intended* signal, and re-capturing is cheap.
- **Group-size merge semantics rest on the `out_of_capacity` + per-query `restrictions` reading** → Confirmed from a real 1-player sample and the spike's behavior, but the full picture needs fixtures captured across all four group sizes for at least one listing. If a slot fits only a partial party (e.g. 2 seats left), correctness depends on `out_of_capacity` being relative to the queried size — pinned by the multi-size fixtures.
- **12 requests per course-date is a lot of fan-out** → Fine for one course with no limiter, but this is exactly why the per-host rate limiter exists in the target design; the fan-out will be throttled once that seam lands.
- **Interface designed against one implementation may need revision** → The `BookingPlatformScraper` surface is shaped by the needs of all four known platforms, so over-fitting to Chronogolf is low-risk; revisit when Webtrac (HTML → Cheerio) exercises the contract differently.
- **Canonical schema lives in `scraper-core`, not a shared package** → Deliberate anti-speculation. When the API needs `TeeTime`, decide then whether to extract a package, import from `scraper-core`, or duplicate.

## Open Questions

- Whether `26895` exposes anything beyond the 6-hole early-bird listing — assumed no for now; the North 6-hole listing is the only one configured.
- Greenbryre's canonical routing for `course_id 2020` — left `[]` (no known routing) per the empirical finding; revisit only if a set distinction surfaces.
