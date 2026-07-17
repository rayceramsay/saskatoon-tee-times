## Why

`apps/scraper-local/src/main.ts` fuses two unrelated jobs into one 130-line function: composing the ingestion pipeline (transports, limiters, four platform scrapers, eight course configs, orchestrator, pricing engine) and driving it on a `node-cron` schedule. `apps/scraper-lambda` is an empty package holding only a `package.json`, so the only way to add a production entrypoint today is to copy those 130 lines — after which every new course must be registered twice, and the day the two lists drift is the day local passes while prod silently scrapes seven courses.

`apps/api` already solved this: `createApp({ reader, ... })` is a pure factory that knows nothing about how it is invoked, and `server.local.ts` is a thin composition root that picks a runtime. The scraper needs the same seam. Package boundaries follow what changes together; deployment target is a build-time choice — which entrypoint you bundle — not a package boundary.

Extracting that seam surfaces a second problem worth fixing in the same pass. Composition currently registers each course in **two parallel lists** — the platform scraper's config array and the `PricingEngine`'s `Map` — that nothing forces to agree. Omit the pricing entry and `PricingEngine.enrich` throws `No pricing config for course "x"`, but only mid-run, after a full scrape has already completed, killing the entire ingestion pass for all eight courses. Every course requires a pricing config, so this is a mandatory relationship expressed as a convention. Nesting `pricing` into `CourseConfig` makes the drift a compile error instead.

## What Changes

**Pricing config nests into course config**

- Move the `CoursePricingConfig`, `PricingRule`, and `DynamicPricingTaxRule` **types** from `scraper-core/src/domain/pricing-engine.ts` to a new `tee-time-domain/src/course-pricing-config.ts`. Pricing **behavior** (`PricingEngine`, `applyTax`, `resolveStatic`) stays in `scraper-core`. The move is forced by layering: `tee-time-domain` cannot import from `scraper-core`, which depends on it.
- **BREAKING** Add a required `pricing: CoursePricingConfig` field to the universal `CourseConfig`, alongside `timeZone`, `maxAdvanceDays`, and `releaseTime`.
- **BREAKING** Collapse each of the eight course modules' two exports (`xConfig` + `xPricingConfig`) into a single `xConfig` carrying `pricing`.
- `PricingEngine`'s constructor keeps taking `ReadonlyMap<CourseId, CoursePricingConfig>`; the composition root derives the map from the course configs. The engine stays decoupled from `CourseConfig`, and `pricing-engine.test.ts` keeps testing with bare pricing configs rather than eight fully-populated course configs.

**Composition extracts into a factory**

- New `apps/scraper/src/ingestion-pipeline.factory.ts` exporting `createIngestionPipeline({ writer, browserSession, logger, limiterConfig }): IngestionPipeline`, owning the limiters, fetchers, host-limited decorators, four platform scrapers, course registry, orchestrator, and pricing engine.
- The factory takes `writer` and `browserSession` — deliberately **not** `documentClient` and `tableName`. `createApp` takes `reader`, a finished collaborator, because `server.local.ts` must call `client.destroy()` and so owns the client and builds the reader from it. The scraper has two closeable resources rather than one, so the rule this change adopts is that **the factory allocates nothing that must be closed**, which puts browser lifecycle — the one genuine local/Lambda difference — on the entrypoint side for free.
- The course registry becomes per-platform arrays flattened into `allConfigs`, so the pricing map is derived in one line and adding a course is one import plus one array entry.

**Packages consolidate**

- Rename `apps/scraper-local` → `apps/scraper` (package `scraper-local` → `scraper`); `src/main.ts` → `src/main.local.ts`.
- Delete the empty `apps/scraper-lambda` stub.
- `main.local.ts` keeps `node-cron`, SIGINT/SIGTERM shutdown, and the launch/close of the browser session and DynamoDB client. `dynamodb-setup.ts` and `console-logger.adapter.ts` move unchanged; `dynamodb-setup.ts` stays local-only.
- Config stays a single `config.ts` schema.

**Non-goals** — deliberately deferred to the follow-up Lambda entrypoint change: `handler.lambda.ts`; the config base/extend split; injectable Playwright launch options (`PlaywrightBrowserSession.launch()` still hardcodes `{ headless: true }`); esbuild bundling (no bundler exists in the repo yet); and whether a failed scrape should fail a Lambda invocation (`pipeline.run()` never throws on partial unit failure).

## Capabilities

### New Capabilities

_None. This change restructures where existing configuration and composition live; it introduces no new capability._

### Modified Capabilities

- `tee-time-pricing`: per-course pricing configuration becomes a required field on the universal `CourseConfig` rather than a separately-authored artifact paired by convention at the composition root, and its types move to `tee-time-domain`. The engine's `courseId`-keyed parameterization is unchanged.
- `tee-time-orchestration`: adds a requirement that scraper composition is a shared factory allocating nothing that must be closed, with every closeable resource owned by a runtime-specific entrypoint.

## Impact

- **Code**: new `packages/tee-time-domain/src/course-pricing-config.ts`; `course-config.base.ts` gains `pricing`. `packages/scraper-core/src/domain/pricing-engine.ts` loses three type declarations and re-points its imports. All eight course modules under `packages/scraper-core/src/platforms/*/courses/` collapse to one export each. `apps/scraper-local` → `apps/scraper` with a new `ingestion-pipeline.factory.ts` and `main.local.ts`. `apps/scraper-lambda` deleted.
- **Package exports**: new `./course-pricing-config` entry in `packages/tee-time-domain/package.json`. `scraper-core`'s `./domain/pricing-engine` entry stays (the engine remains there).
- **Tests**: `pricing-engine.test.ts` imports `greenbryrePricingConfig` (`:148`) — repoints to `greenbryreConfig.pricing`; its `engineFor` helper is unaffected.
- **Behavior**: none. The same eight courses scrape and persist identically; this is a pure restructuring, verified by the existing local run.
- **Verified safe**: no adapter spreads a course config into its output — every `ScrapedTeeTime` is built field-by-field (TeeOn's `base` at `teeon-scraper.adapter.ts:143` names each field explicitly), so `pricing` has no path into a persisted record.
- **Downstream**: unblocks the follow-up Lambda entrypoint change, whose `handler.lambda.ts` calls the same factory per invocation with a per-invocation browser session closed in a `finally`.
- **Not affected**: `apps/api`, `apps/web`, the persistence layer, the `TeeTimeOrchestrator` and `IngestionPipeline` classes themselves, every scraper adapter's parsing logic, and the price resolution rules (dynamic → static → null).
