## 1. Domain: booking window & bookable dates

- [x] 1.1 Add `maxAdvanceDays` and `releaseTime` to `CourseConfig` (`course-config.base.ts`)
- [x] 1.2 Populate Greenbryre's booking window (`courses/greenbryre.ts`), sourcing real values from the PRD addendum / booking site
- [x] 1.3 Implement `bookableDates(config, now)` domain util computing local dates in the course `timeZone`, withholding the furthest date before `releaseTime`
- [x] 1.4 Unit-test `bookableDates` at the `releaseTime` boundary and across day rollover

## 2. Domain: canonical TeeTime schema & pass-through

- [x] 2.1 Add `TeeTime` schema (extends `BaseTeeTime` with nullable `pricePerPlayer`) in `tee-time.schema.ts`
- [x] 2.2 Implement the `ScrapedTeeTime → TeeTime` pass-through mapper (`pricePerPlayer = dynamicPrice`)
- [x] 2.3 Unit-test the pass-through preserves shared fields and maps price (including null)

## 3. Orchestration

- [x] 3.1 Implement the orchestrator: expand scrapers into `(scraper, courseId, date)` units via `bookableDates`, run under `Promise.all`
- [x] 3.2 Add per-unit failure isolation (rejection → no records + surfaced/logged, run continues)
- [x] 3.3 Unit-test fan-out flattening and that one failing unit does not abort the run

## 4. Persistence port & DynamoDB adapter

- [x] 4.1 Define the `TeeTimeRepository` port with a snapshot-replace-by-`(courseId, date)` operation
- [x] 4.2 Add AWS SDK v3 DynamoDB dependency to `scraper-core` (or the owning package)
- [x] 4.3 Implement the DynamoDB adapter: item marshalling with `PK = date`, `SK = courseId#startInstant#holes#routing` (empty routing → sentinel), and numeric TTL = `epoch(startInstant)`
- [x] 4.4 Implement snapshot-replace: query unit keys by `SK begins_with "courseId#"`, diff, delete vanished, put current — paged in chunks of 25, handling `UnprocessedItems`
- [x] 4.5 Test the adapter against local DynamoDB: vanished slots removed, routing distinguishes otherwise-identical slots

## 5. Ingestion pipeline

- [x] 5.1 Implement `IngestionPipeline.run(now)` composing orchestrate → map-to-`TeeTime` → persist, with injected stages
- [x] 5.2 Unit-test the pipeline invokes stages in order with stubbed collaborators

## 6. Local runtime: scraper-local entrypoint

- [x] 6.1 Add docker-compose service for `amazon/dynamodb-local`
- [x] 6.2 Add table bootstrap (create table + enable TTL) against the local endpoint
- [x] 6.3 Configure the DynamoDB SDK client for the local endpoint via explicit env/config (endpoint + dummy credentials)
- [x] 6.4 Wire the composition root in `scraper-local`: build ChronogolfV1 scraper + orchestrator + repository + pipeline
- [x] 6.5 Add the in-process cron invoking `IngestionPipeline.run(now)` on an interval

## 7. Verify end-to-end

- [x] 7.1 Run the local cron once and `aws dynamodb scan` the local table to confirm Greenbryre tee times land
- [x] 7.2 Re-run and confirm snapshot-replace reconciles (a slot removed between runs disappears from the table)
- [x] 7.3 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors

## Verification notes & evidence

**Two defects found and fixed while verifying (§7):**

1. **docker-compose volume permission (6.1).** `amazon/dynamodb-local` runs as uid 1000, but the
   named volume mounts root-owned, so every write failed with `unable to open database file` and
   `CreateTable` hung (SDK retrying the server-side 500) — the pipeline never got past table
   bootstrap. Fixed by running the service as `user: root` in `docker-compose.yml`.
2. **Integration test never ran (4.5).** The testcontainers test exposed port `8093`, but
   DynamoDB Local listens on `8000` inside the container, so testcontainers waited 60s for a port
   that never binds and skipped all assertions (was marked done but had never passed). Fixed the
   constant to `8000`; now 3/3 pass in ~3.6s, covering vanished-slot removal, routing distinctness,
   and TTL marshalling.

**7.1 — tee times land.** A pipeline run landed **731** Greenbryre tee times across the 7 future
dates (2026-07-10 … 07-16); `aws dynamodb scan` confirmed the canonical item shape: `PK=date`,
`SK=greenbryre#<startInstant>#<holes>#<routing|->`, `pricePerPlayer` (pass-through of `dynamicPrice`,
e.g. `46.62`), and numeric `ttl` = epoch(startInstant).

**7.2 — snapshot-replace reconciles.** Verified two ways: (a) the adapter integration test asserts a
slot vanishing between replaces is deleted; (b) a live second run reconciled deterministically —
total went 731 → 830 (not ~1462, so no accumulation), **0** items retained the prior run's
`scrapedAt` (every unit fully rewritten), and date `2026-07-16` went **65 → 63** as slots that
disappeared upstream were removed from the table.

**Known limitation (deferred, not a defect in this slice).** The orchestrator fans out
`dates × listings × group-sizes` (≈96) `fetchJson` calls with no concurrency bound, each opening a
page in a single shared Playwright browser context. That contention makes most `page.goto` calls
exceed the 30s default navigation timeout, so full-window live runs are unreliable. This is the
consequence of the intentionally-deferred per-host choke point (Decision 3 / FR-1.6 `HostRateLimiter`);
the §7 evidence above was gathered with the Chronogolf V1 adapter's inner fetches temporarily
serialized (i.e. ran sequentially rather than concurrently) to isolate the pipeline from that contention. Adding the concurrency bound is future work.
