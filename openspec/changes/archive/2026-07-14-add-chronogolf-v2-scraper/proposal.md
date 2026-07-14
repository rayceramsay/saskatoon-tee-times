## Why

The Willows Golf & Country Club books through Chronogolf's **V2** marketplace API — a different endpoint and payload shape from the Chronogolf V1 API the dashboard already scrapes for Greenbryre. Adding it brings another major Saskatoon course online and exercises two mechanics no current scraper has: a **paginated** availability feed walked page-by-page, and a course whose **same wall-clock start appears on multiple sub-loops** under one `courseId`.

## What Changes

- Add a **Chronogolf V2 platform scraper** (`platforms/chronogolf-v2/`) that fetches a course's tee-time availability from the `/marketplace/v2/teetimes` endpoint through the existing injected `JsonFetcher` (browser-navigated, same transport V1 uses) and normalizes it into `ScrapedTeeTime` records. A single `scrape` walks `page=1,2,3…` **sequentially** until a page returns no tee times, then parses and concatenates the pages.
- Parse each V2 tee time with group sizes taken **inline** from `[min_player_size .. max_player_size]` (contiguous) — no per-size fan-out (unlike V1). Each start **fans out over `course.bookable_holes`** into a 9-hole record and an 18-hole record, both with `routing: [course.name]` (the partner loop for an 18-hole round is not exposed by the API).
- Attach the raw price only to the hole count `default_price.bookable_holes` actually covers (the API returns the 9-hole public green fee); the other hole count carries `dynamicPrice: null`. This gap is inherent to the endpoint and is accepted.
- Build, for each valid group size, a **rung-1 reservation-review deep link** carrying the slot's `teetime_id`, the hole count (`nb_holes`), `engine=2`, and `affiliation_type_ids` repeated once per player — assembled in the scraper with zero extra requests.
- Add the single Chronogolf V2 course, **The Willows**, as a config entry (the three physical-loop course UUIDs plus the `18` combined-round toggle in `courseIds`, `slug`, `affiliationTypeId`, scrape `tld`, and user-facing `bookingTld`), written so further V2 courses are config-only additions. Its `CoursePricingConfig` grosses the pre-tax scraped fee up by `0.11`.
- Wire the Chronogolf V2 scraper and its pricing config into the local scraper composition root, reusing the existing browser `JsonFetcher` limiter stack.

## Capabilities

### New Capabilities
<!-- None — this change extends existing capabilities rather than introducing new ones. -->

### Modified Capabilities

- `tee-time-scraping`: adds the Chronogolf V2 platform (paginated `/marketplace/v2/teetimes` feed parsed into records with inline group sizes and a per-hole-count fan-out, per-size reservation-review deep links, all courses as configuration).

## Impact

- **Code (`@stt/scraper-core`)**: new `platforms/chronogolf-v2/**` (scraper adapter + test, course config type, `courses/the-willows.ts`, `__fixtures__/`); new `package.json` `exports` entries for the adapter and the course.
- **Composition root (`apps/scraper-local`)**: additive wiring of the Chronogolf V2 scraper (reusing the existing browser-`JsonFetcher` limiter instance) and its pricing config entry.
- **External dependency**: adds a live dependency on `www.chronogolf.<tld>/marketplace/v2/teetimes`; parser correctness is pinned to committed JSON fixtures.
- **No new npm dependencies** — `playwright-core` and `zod` are already present; transport (`PlaywrightJsonFetcher` + `HostLimitedJsonFetcher`) is unchanged.
- **No schema-breaking change**: `'chronogolf-v2'` is already a valid `PlatformId`; `ScrapedTeeTime`/`TeeTime` shapes and the persistence key (`courseId#startInstant#holes#routing`, which already disambiguates same-time starts on different loops by routing) are unchanged.
- **Accepted gap**: 18-hole records carry no scraped price (the V2 feed prices only the 9-hole round); the pricing engine leaves them `pricePerPlayer: null`.
