## Why

A scheduled ingestion run is silent unless something throws: the only logs are process startup, cron `execution:failed`/`execution:overlap`, and a per-unit "Scrape unit failed" error. A fully successful run prints nothing for up to 15 minutes, so a healthy run is indistinguishable from a hung one, and there is no signal of progress, throughput, or partial failure. Adding leveled, structured run observability makes local development legible and gives the eventual Lambda/CloudWatch scraper reusable events.

## What Changes

- Add a `debug` level to the `Logger` port alongside `info`/`warn`/`error`.
- Make `debug` opt-in: `ConsoleLogger` gains a minimum-level threshold, driven by a new fail-loud `LOG_LEVEL` config enum defaulting to `info`.
- Inject the `Logger` into `IngestionPipeline`; emit an info-level run-started event and an info-level run-finished summary (duration, units ok/failed, tee times persisted, groups written), plus debug-level persist-stage detail (start, per-group write, finish).
- **BREAKING** (internal): `TeeTimeOrchestrator.scrapeAllBookable` returns a structured result carrying both the flattened records and per-unit outcomes, instead of a bare `ScrapedTeeTime[]`, so the pipeline can total successes/failures for the summary.
- Emit per-unit debug detail (unit ok with record count and duration) from the orchestrator; keep the existing per-unit error on failure.

## Capabilities

### New Capabilities

- `ingestion-observability`: Leveled, opt-in structured logging (adds `debug`, a configurable minimum-level threshold) and the ingestion run's lifecycle events — run start, run-finished summary with counts and duration, and debug-level per-unit and persist-stage detail.

### Modified Capabilities

- `tee-time-orchestration`: The orchestrator's fan-out result changes from a flattened `ScrapedTeeTime[]` to a structured result that carries both the flattened records and per-unit outcomes, enabling downstream success/failure totals.

## Impact

- `packages/scraper-core/src/domain/logger.port.ts` — add `debug`.
- `packages/scraper-core/src/domain/tee-time-orchestrator.ts` — structured result with per-unit outcomes; per-unit debug logging.
- `packages/scraper-core/src/domain/ingestion-pipeline.ts` — inject `Logger`; run start/summary (info) and persist-stage detail (debug).
- `apps/scraper-local/src/console-logger.adapter.ts` — minimum-level threshold.
- `apps/scraper-local/src/config.ts` — `LOG_LEVEL` enum (default `info`).
- `apps/scraper-local/src/main.ts` — pass `LOG_LEVEL` into `ConsoleLogger`; inject logger into the pipeline.
- Tests for the orchestrator, pipeline, and console logger updated for the new return shape and log events.
