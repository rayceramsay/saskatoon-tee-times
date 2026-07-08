## Context

`packages/scraper-core` is greenfield beyond its first vertical slice (Chronogolf
V1 → Greenbryre). The code is clean; the file *organization* is not. This design
records the decisions behind the new layout so they survive independently of any
scratch notes. No observable behaviour changes; the `tee-time-scraping` spec sees
only a wording refinement to one requirement (see the proposal and Decision 5).

## Governing principles

Every decision below follows from these:

- **Co-change is the grouping law.** Things that change together live together;
  things on different change axes get separated — regardless of their "kind."
- **A suffix earns its place** only when it names an *architectural role* the
  filename doesn't already convey, *and* that role changes how you use the file.
  If the name already implies it, or it marks a non-architectural attribute, drop
  the suffix.
- **Echo enough of a base/port name that the link is unmistakable — no more.**
  (Governs how much of a base name an implementation's filename repeats.)
- **Single-purpose file good; kitchen-sink `utils.ts` bad.** Single
  responsibility, not file size, is the test. Never merge *unrelated* helpers.
- **Test behaviours, not implementation details** (CLAUDE.md).

## Decision 1 — Layers, not noun-buckets

Replace `schema/`, `time/`, `platforms/` with three layer-named directories:

```
src/
├── domain/       canonical model + framework contracts (the "what this package is")
├── transport/    the JSON-fetch port and its adapter
└── platforms/    concrete platform implementations only (chronogolf-v1/, …)
```

`domain/` collects what was scattered across `schema/`, `time/`, and the loose
framework files in `platforms/`. `platforms/` is demoted to holding *only*
concrete implementations, so the framework-vs-implementation boundary is now
legible from the tree.

**Rejected — purist hexagonal split** (port in `domain/`, adapter in
`infrastructure/`). Co-change wins: a transport port and its sole adapter change
together, so they stay together in `transport/`. Splitting them would scatter one
change axis across two top-level folders for a purity that buys nothing here.

## Decision 2 — Two relationships, two vocabularies

Do not force everything into port/adapter. There are two distinct relationships,
and collapsing them would blur the precise meaning of `.port`:

```
Behavioral contract  (methods you implement)   →  PORT / ADAPTER
    JsonFetcher            ← PlaywrightJsonFetcher
    BookingPlatformScraper ← ChronogolfV1Scraper

Data shape           (fields you extend)        →  BASE / EXTENSION
    CourseConfig           ← ChronogolfV1CourseConfig
```

`.port` stays reserved for a behavioral interface; a data shape others extend is
`.base`, not a port.

## Decision 3 — Suffix vocabulary

| Suffix        | Means                                   | Applied to                                         |
| ------------- | --------------------------------------- | -------------------------------------------------- |
| `.port.ts`    | Behavioral interface others implement   | `json-fetcher`, `booking-platform-scraper`         |
| `.adapter.ts` | Implementation of a `.port`             | `playwright-json-fetcher`, `chronogolf-v1-scraper` |
| `.base.ts`    | Base data shape others extend           | `course-config`                                    |
| `.schema.ts`  | Runtime Zod validator / boundary type   | `primitives`, `tee-time`                           |
| `.util.ts`    | Pure helper function                    | `best-booking-url`, `local-start-instant`          |
| _(none)_      | Name already conveys the role           | course data files (`greenbryre.ts`)                |

**Naming echo.** An implementation's filename contains the port/base name plus a
qualifier — echoing exactly as much as it takes to make the link unmistakable:

- `scraper` alone is unmistakable → `chronogolf-v1-scraper.adapter.ts` (drops
  "booking-platform").
- `config` alone is too generic → keep more: `chronogolf-v1-course-config.ts`
  (echoes "course-config").

## Decision 4 — Rename the base config type

```
BEFORE:  CourseBookingConfig  ←  ChronogolfV1CourseConfig   (base has "Booking", child drops it)
AFTER:   CourseConfig         ←  ChronogolfV1CourseConfig   ✓ aligned
```

"Booking" was redundant qualification — the entire package is about booking. The
type pair should echo as tightly as the filenames do.

## Decision 5 — Fold parse + merge + url into the scraper adapter

`buildTeeTimesRequestUrl`, `RawChronogolfV1TeeTime` (+ `parseResponse`), and
`mergeListing` all change together with the Chronogolf API — **one change axis** —
so they fold into `chronogolf-v1-scraper.adapter.ts` as module-private functions.

What stays **separate** (different change axes):

- `chronogolf-v1-course-config.ts` — the config *type*, imported by course data
  files, which must not pull in the scraper's machinery.
- `courses/greenbryre.ts` — course *data*; changes when courses are
  added/edited, not when the API changes.

**Rejected — dot-grouping** (keeping parse/merge as separate `.parse.ts` /
`.merge.ts` files). Folding better reflects the single change axis and collapses
the many-tabs-per-platform problem.

`.util.ts` helpers stay shared in `domain/` (they are genuinely reused by the
merge logic) rather than being made private and promoted later.

## Decision 6 — Test through `scrape()`

Since parse/merge become private, test them through the public `scrape()` with a
stub `JsonFetcher` that returns committed fixtures. This matches the test pyramid
and "test behaviours, not implementation details":

```
parse+merge, fed a fixture   →  UNIT         (stub JsonFetcher → fixtures)  ← what we assert
scrape() making a real fetch →  INTEGRATION  (manual/live run)
```

Coverage is preserved: a drifted fixture shape still turns the scraper test red
(schema drift is caught). The stub maps each `(listing × groupSize)` request URL
to the right fixture JSON — the existing scraper adapter test already does this,
so the work is to migrate assertions into it, not to build new infrastructure.

Assertions to carry over from the deleted `parse-response.test.ts` and
`merge-listing.test.ts`: non-contiguous `groupSizes`, fully-booked slots dropped,
`startInstant` offset correctness, `holes`/`routing` sourced from the listing,
`dynamicPrice` present-and-null cases, and portal-fallback `bookingUrls`.

## Target structure

```
src/
├── domain/
│   ├── primitives.schema.ts               (GroupSize, CourseId, PlatformId)
│   ├── tee-time.schema.ts                 (BaseTeeTime, ScrapedTeeTime)
│   ├── course-config.base.ts              (CourseConfig — extend me)
│   ├── booking-platform-scraper.port.ts   (BookingPlatformScraper)
│   ├── best-booking-url.util.ts
│   └── local-start-instant.util.ts
├── transport/
│   ├── json-fetcher.port.ts               (JsonFetcher)
│   └── playwright-json-fetcher.adapter.ts (PlaywrightJsonFetcher)
└── platforms/
    └── chronogolf-v1/
        ├── chronogolf-v1-scraper.adapter.ts     (class + private url/parse/merge/raw-schema)
        ├── chronogolf-v1-course-config.ts       (ChronogolfV1CourseConfig, ChronogolfV1Listing)
        ├── chronogolf-v1-scraper.adapter.test.ts
        ├── courses/
        │   └── greenbryre.ts
        └── __fixtures__/…
```

## Package exports

Out of scope for this refactor. No `exports` map exists today and nothing imports
`@stt/scraper-core` yet, so there is nothing to repoint. The first consumer will
introduce the map against the (already-final) new paths.
