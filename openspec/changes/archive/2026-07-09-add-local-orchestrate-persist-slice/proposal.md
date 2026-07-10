## Why

The Chronogolf V1 / Greenbryre scraper produces `ScrapedTeeTime[]` in memory, but nothing runs it and nothing stores the result — `scraper-core` is a library no code path executes. This slice drives that one proven scraper all the way through orchestration and into a local data store, turning an invisible library into a table you can query. It derisks every unproven seam (booking-window fan-out, failure isolation, the canonical persisted type, DynamoDB round-trip) against a single course before more platforms are added.

## What Changes

- Add booking-window fields (`maxAdvanceDays`, `releaseTime`) to `CourseConfig`, and populate them for Greenbryre.
- Add a `bookableDates(config, now)` domain utility that expands a course's booking window into the local calendar dates to scrape (respects `releaseTime` and `timeZone`).
- Add a canonical **`TeeTime`** schema — the public, persisted type — introduced now as a **pass-through** of `ScrapedTeeTime` (`pricePerPlayer = dynamicPrice`), keeping the pricing seam's shape intact so the pricing engine slots in later without touching persistence.
- Add an **Orchestrator** that fans out every `(course, date)` unit with `Promise.all`, isolates per-unit failures (one failure never stops the rest), and returns the flattened tee times.
- Add a **`TeeTimeRepository`** port and a **DynamoDB adapter** that persists via **snapshot-replace per `(course, date)`**: query the unit's current keys, delete the vanished ones, put the current set (paged `BatchWriteItem`, non-transactional, self-healing). Table keyed `PK = date`, `SK = course#startInstant#holes#routing`, with a TTL attribute on `startInstant` for past-date eviction (FR-1.4).
- Add an **`IngestionPipeline`** (orchestrate → persist) that entrypoints invoke, so stages are never composed ad hoc.
- Add the **`scraper-local`** entrypoint: an in-process cron that runs the pipeline, wired against a **docker `amazon/dynamodb-local`** instance (docker-compose + local AWS SDK client config).
- **Deferred (explicitly out of scope):** `HostRateLimiter`, HTTP 429/503 backoff (FR-1.6), and the `PricingEngine` / static pricing rules (FR-1.7). The transactional/atomic write path is also deferred; the design documents versioned-snapshot + pointer-swap as the future escape hatch if atomic reads ever become required.

## Capabilities

### New Capabilities

- `tee-time-orchestration`: Expanding courses into `(course, date)` work units over their booking windows, fanning out scrapes with per-unit failure isolation, and composing the ordered ingestion pipeline that entrypoints invoke.
- `tee-time-persistence`: The canonical persisted `TeeTime` type and a repository that snapshot-replaces a course-date's tee times into a keyed store, with past-date eviction via TTL.

### Modified Capabilities

- `tee-time-scraping`: `CourseConfig` gains booking-window fields (`maxAdvanceDays`, `releaseTime`) so a course's bookable dates can be computed; this is a new requirement on the course configuration contract.

## Impact

- **Packages:** `packages/scraper-core` — new orchestration + persistence domain/ports, `TeeTime` schema, `bookableDates` util, `CourseConfig` change.
- **Apps:** `apps/scraper-local` — new cron entrypoint and composition root (currently empty).
- **Infra (local only):** docker-compose running `amazon/dynamodb-local`; local table creation/bootstrap; AWS SDK v3 DynamoDB dependency.
- **No changes** to `api`, `web`, or any deployed AWS infrastructure in this slice.
- **Existing specs:** `tee-time-scraping` course-config requirement is extended (booking window).
