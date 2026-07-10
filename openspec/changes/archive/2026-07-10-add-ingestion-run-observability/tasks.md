## 1. Logger port and leveled console adapter

- [x] 1.1 Add `debug(message, context?)` to the `Logger` port in `packages/scraper-core/src/domain/logger.port.ts` with a doc comment describing it as opt-in developer detail
- [x] 1.2 Give `ConsoleLogger` a constructor `minLevel` and an internal level ordering (`debug < info < warn < error`); no-op any method whose level is below `minLevel`, route `debug` to `console.debug`
- [x] 1.3 Update `apps/scraper-local/src/console-logger.adapter.ts` tests (or add them) to assert `debug` is suppressed at the default `info` level and emitted when `minLevel` is `debug`, and that `info`/`warn`/`error` always emit

## 2. Log level configuration

- [x] 2.1 Add a `LOG_LEVEL` Zod enum (`debug`/`info`/`warn`/`error`) to `apps/scraper-local/src/config.ts`, default `info`, surfaced via the existing `prettifyError` fail-loud path
- [x] 2.2 In `apps/scraper-local/src/main.ts`, construct `new ConsoleLogger(config.LOG_LEVEL)`
- [x] 2.3 Document `LOG_LEVEL` in `apps/scraper-local/.env.example`

## 3. Orchestrator structured result

- [x] 3.1 Define the `UnitOutcome` and `OrchestrationResult` (`{ teeTimes, unitOutcomes }`) types in `packages/scraper-core/src/domain/tee-time-orchestrator.ts`
- [x] 3.2 Change `scrapeAllBookable` to build and return `OrchestrationResult`; on success record an `ok` outcome with record count, on failure record a `failed` outcome (0 records) and keep the existing per-unit `error`
- [x] 3.3 Emit a per-unit `debug` event on success in `runScrapeUnit` (`unit ok` with platform/course/date, record count, and duration)
- [x] 3.4 Update `tee-time-orchestrator.test.ts` for the new return shape: assert flattened records, per-unit outcomes (ok/failed with counts), failure isolation, and that failures still surface at `error`

## 4. Pipeline lifecycle and summary logging

- [x] 4.1 Inject `Logger` into `IngestionPipeline` (constructor dependency, positioned as an injectable like `mapToTeeTime`)
- [x] 4.2 Consume the orchestrator's `OrchestrationResult`; emit an info `run started` event reporting the queued-unit count
- [x] 4.3 Wrap `run` with a wall-clock timer (`performance.now()`) and emit an info `run finished` summary: duration, units ok/failed (from `unitOutcomes`), tee times persisted, and groups written
- [x] 4.4 Emit `debug` persist-stage detail: `persisting N groups` before the `Promise.all`, per-group `wrote M tee times` for each `(course, date)` group, and `persist finished` after
- [x] 4.5 Update `ingestion-pipeline.test.ts`: inject a fake/spy `Logger`, assert the info start and summary events (with correct ok/failed/tee-time/group counts including a partial-failure case) and that persist-stage detail is emitted at `debug`

## 5. Wiring and verification

- [x] 5.1 Update `main.ts` pipeline construction to pass the injected `logger`
- [x] 5.2 Run the scraper-local runtime with default `LOG_LEVEL` and confirm the info start + summary lines appear; run once with `LOG_LEVEL=debug` and confirm per-unit and persist detail appears
- [x] 5.3 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors
