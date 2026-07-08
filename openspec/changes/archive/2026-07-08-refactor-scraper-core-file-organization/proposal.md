## Why

The first vertical slice (Chronogolf V1 → Greenbryre) produced clean code but a
disorienting file layout in `packages/scraper-core`. Four problems compound:

1. **Folders are named by category, code is organized by layer, and they don't
   line up.** The project mandate is hexagonal (domain / application /
   infrastructure), but the folders are `schema/`, `time/`, `platforms/` —
   noun-buckets, not layers. You navigate looking for a layer; the tree answers
   in categories.
2. **The domain model is scattered across four locations** — `schema/`, `time/`,
   and three loose files inside `platforms/`. Nothing says "this is what this
   package *is*."
3. **`platforms/` does two jobs at once.** It holds the shared *framework*
   (scraper contract, base course config, transport port + adapter, helpers) and
   a concrete *implementation* (`chronogolf-v1/`) as siblings, with no signal
   telling them apart.
4. **Noise and smear.** Repeated hyphenated prefixes
   (`chronogolf-v1/chronogolf-v1-scraper.ts`) read as noise, and "scrape one
   course" is spread across ~5 one-function files, so understanding one platform
   means opening many tabs.

This is a behaviour-neutral refactor: no observable behaviour changes and the
package's public surface is unchanged. Only the file layout, filenames, a base
type name, and test entry points move. The `tee-time-scraping` spec sees a single
wording refinement (not a behavioural change) — see Capabilities.

## What Changes

- **Reorganize `src/` into hexagonal layers.** Replace the `schema/`, `time/`,
  `platforms/` (noun-bucket) tree with `domain/`, `transport/`, and a
  `platforms/` that now holds *only* concrete platform implementations:
  - `domain/` — the canonical model and framework contracts: primitives, the
    tee-time schema, the base course-config shape, the `BookingPlatformScraper`
    port, and the two shared pure helpers.
  - `transport/` — the `JsonFetcher` port and its `PlaywrightJsonFetcher`
    adapter, kept together (co-change over a purist port-in-domain split).
  - `platforms/chronogolf-v1/` — the concrete Chronogolf V1 implementation.
- **Apply a consistent role-suffix vocabulary** (`.port.ts`, `.adapter.ts`,
  `.base.ts`, `.schema.ts`, `.util.ts`, or none) so a filename announces its
  architectural role. See `design.md`.
- **Rename the base config type** `CourseBookingConfig` → `CourseConfig` so the
  type pair echoes as tightly as the filenames
  (`CourseConfig ← ChronogolfV1CourseConfig`). "Booking" was redundant — the
  whole package is about booking.
- **Fold the Chronogolf-API-coupled functions into the scraper adapter.**
  `buildTeeTimesRequestUrl`, `parseResponse` (+ `RawChronogolfV1TeeTime`), and
  `mergeListing` change together with the Chronogolf API — one change axis — so
  they become module-private functions inside
  `chronogolf-v1-scraper.adapter.ts`, and their standalone files are deleted.
- **Consolidate the Chronogolf tests behind `scrape()`.** Migrate the assertions
  from `parse-response.test.ts` and `merge-listing.test.ts` into the scraper
  adapter test (which already drives `scrape()` with a stub `JsonFetcher` over
  committed fixtures), then delete the two standalone test files. This preserves
  coverage — a drifted fixture shape still turns the scraper test red — while
  testing behaviour, not private implementation details.

Explicitly **out of scope**: adding a `package.json` `exports` map. None exists
today and nothing consumes this package yet; whoever first imports `scraper-core`
will introduce exports then. The dot-grouping alternative (keeping parse/merge as
separate `.parse.ts` / `.merge.ts` files) and a purist port-in-`domain` /
adapter-in-`infrastructure` split are also rejected here (see `design.md`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tee-time-scraping`: **Behaviour is unchanged.** One requirement's wording is
  refined, not its behaviour. Folding `parseResponse` into the scraper adapter as
  a private function makes the "Chronogolf V1 response parsing" requirement's
  implementation-leaning phrase ("provide a pure function") stale, so it is
  retargeted to the behaviour it actually guarantees — response-shape drift
  surfaces as a failing test, independent of how parsing is factored internally.
  No scenario's observable outcome changes.

## Impact

- **Code moved/renamed:** every file under `packages/scraper-core/src/`; internal
  import specifiers updated across the package (`.js` extension specifiers
  included). No behaviour changes.
- **Public surface:** unchanged. No `exports` map exists to update, and no app
  (`apps/scraper-lambda`, `apps/scraper-local`, `apps/api`, `apps/web`) or other
  package imports `@stt/scraper-core` yet, so there are no downstream import
  breakages.
- **Tests:** two standalone test files deleted; their assertions relocated into
  the scraper adapter test. Net coverage preserved.
- **Verification:** `pnpm format`, `pnpm check-types`, `pnpm lint`, `pnpm test`
  must all pass with no behavioural diff.
