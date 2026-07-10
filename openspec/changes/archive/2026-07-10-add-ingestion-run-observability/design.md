## Context

`scraper-local` drives an in-process `node-cron` task every 15 minutes that runs `IngestionPipeline.run(now)`: orchestrate → map → persist. The only observability today is process startup, cron `execution:failed`/`execution:overlap` handlers in `main.ts`, and a per-unit `error` in `TeeTimeOrchestrator`. The `Logger` port (`debug`-less) is injected only into the orchestrator; the pipeline has no logger. `scrapeAllBookable` returns a flat `ScrapedTeeTime[]`, which discards which unit produced what and which units failed — so a run-level summary cannot be built from its output.

This is a local dev runtime, so the primary consumer is a human reading a terminal. But the `Logger` port and its events are domain-level and will be reused by the future Lambda/CloudWatch scraper, so events stay structured.

## Goals / Non-Goals

**Goals:**
- A healthy run is legible: an info-level start line and an info-level summary (duration, units ok/failed, tee times, groups) every run.
- Developer-facing play-by-play (per-unit completion, persist stage) available on demand without noise by default.
- Keep events structured (message + context object) so a non-console adapter can consume them later.
- Preserve per-unit failure isolation and the existing `error` surface.

**Non-Goals:**
- Metrics, tracing, or a real observability backend (CloudWatch wiring is future work).
- Changing concurrency, throttling, or the pipeline's stage order.
- Per-unit *success* logging at `info` (would be ~96 lines/run — reserved for `debug`).
- A logging library; `ConsoleLogger` stays a thin adapter.

## Decisions

### Add `debug` to the `Logger` port, gated by a minimum level in the adapter

`debug` becomes the fourth method on the port. The *filtering* lives in the adapter (`ConsoleLogger`), not the port: the port stays a pure sink contract, and the adapter is constructed with a minimum level, ordering levels `debug < info < warn < error` and no-op-ing anything below the threshold. Alternative — a `level` argument on a single `log()` method — was rejected to keep call sites readable (`logger.debug(...)`) and the port shape stable.

### `LOG_LEVEL` config enum, default `info`, fail-loud

The threshold is explicit configuration, matching the project's env-config style: a Zod enum keyed `LOG_LEVEL` in `apps/scraper-local/src/config.ts` over the four level names, defaulting to `info`, surfaced through `prettifyError`. An unknown value fails config loading rather than silently coercing. `main.ts` passes `config.LOG_LEVEL` into `new ConsoleLogger(...)`.

### Inject `Logger` into `IngestionPipeline`; the coordinator narrates

The pipeline gains a `Logger` constructor dependency (defaulted-injectable like `mapToTeeTime` for tests). It emits:
- info `run started` with queued-unit count, emitted *before* the scrape (the run's longest, most likely-to-hang stage) so a healthy run is visible immediately; the count comes from a pure `planUnitCount(now)` unit-expansion pass on the orchestrator, not from the post-scrape outcomes,
- debug persist-stage: `persisting N groups`, per-group `wrote M tee times` , `persist finished`,
- info `run finished` summary built from the orchestrator's per-unit outcomes plus persisted totals and a wall-clock duration (`performance.now()` around `run`).

The per-group and per-unit *detail* stays out of the repository and orchestrator's return path respectively — the pipeline drives the `Promise.all` over `replaceUnitTeeTimes`, so it owns the persist narration and the repository adapter stays logging-unaware.

### `scrapeAllBookable` returns a structured result, not a flat array

New return shape carries both the flattened records and per-unit outcomes, e.g.:

```
interface UnitOutcome {
  platform; courseId; date;
  status: 'ok' | 'failed';
  recordCount: number;   // 0 on failure
}
interface OrchestrationResult {
  teeTimes: ScrapedTeeTime[];
  unitOutcomes: UnitOutcome[];
}
```

The orchestrator emits per-unit debug (`unit ok` with count + duration) inside `runScrapeUnit` and keeps the existing per-unit `error`. The pipeline consumes `unitOutcomes` to total ok/failed for the summary. Alternative — orchestrator emits its own aggregate summary event and keeps returning a flat array — was rejected: it scatters summary logic into the orchestrator and couples it to summary formatting, whereas returning data keeps the pipeline as the single narrator. This is an internal breaking change to the orchestrator's signature; callers are `IngestionPipeline` and its tests.

## Risks / Trade-offs

- [Per-unit debug at ~96 units is verbose] → It is debug-only and opt-in; default `info` runs stay to two lines plus any failures.
- [Duration via `performance.now()` measures wall-clock incl. throttling waits] → That is the intended signal ("is it hanging?"); documented in the summary as wall-clock.
- [Structured result is an internal breaking change] → Blast radius is the pipeline and orchestrator tests only; both are updated in the same change. No external consumers.
- [`debug` filtering in the adapter means other future adapters must re-implement the threshold] → Acceptable now (one adapter); a shared leveled base can be extracted if a second adapter appears.

## Migration Plan

Additive within one change: extend the port, add the config key (defaulting to `info` preserves current output plus the new info summary), update the orchestrator signature and its two callers together, and update the affected unit tests. No data migration, no deploy coordination — local runtime only. Rollback is reverting the change.

## Open Questions

- None blocking. Exact summary wording/glyphs (e.g. `95/96 units ok · 412 tee times · 34 groups written`) is cosmetic and can be finalized during implementation.
