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

- [ ] 4.1 Define the `TeeTimeRepository` port with a snapshot-replace-by-`(courseId, date)` operation
- [ ] 4.2 Add AWS SDK v3 DynamoDB dependency to `scraper-core` (or the owning package)
- [ ] 4.3 Implement the DynamoDB adapter: item marshalling with `PK = date`, `SK = courseId#startInstant#holes#routing` (empty routing → sentinel), and numeric TTL = `epoch(startInstant)`
- [ ] 4.4 Implement snapshot-replace: query unit keys by `SK begins_with "courseId#"`, diff, delete vanished, put current — paged in chunks of 25, handling `UnprocessedItems`
- [ ] 4.5 Test the adapter against local DynamoDB: vanished slots removed, routing distinguishes otherwise-identical slots

## 5. Ingestion pipeline

- [ ] 5.1 Implement `IngestionPipeline.run(now)` composing orchestrate → map-to-`TeeTime` → persist, with injected stages
- [ ] 5.2 Unit-test the pipeline invokes stages in order with stubbed collaborators

## 6. Local runtime: scraper-local entrypoint

- [ ] 6.1 Add docker-compose service for `amazon/dynamodb-local`
- [ ] 6.2 Add table bootstrap (create table + enable TTL) against the local endpoint
- [ ] 6.3 Configure the DynamoDB SDK client for the local endpoint via explicit env/config (endpoint + dummy credentials)
- [ ] 6.4 Wire the composition root in `scraper-local`: build ChronogolfV1 scraper + orchestrator + repository + pipeline
- [ ] 6.5 Add the in-process cron invoking `IngestionPipeline.run(now)` on an interval

## 7. Verify end-to-end

- [ ] 7.1 Run the local cron once and `aws dynamodb scan` the local table to confirm Greenbryre tee times land
- [ ] 7.2 Re-run and confirm snapshot-replace reconciles (a slot removed between runs disappears from the table)
- [ ] 7.3 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors
