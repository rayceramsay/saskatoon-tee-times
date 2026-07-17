## Context

The system runs end to end locally. Getting it to production needs a scraper Lambda entrypoint, and `apps/scraper-lambda` is an empty package. Before that entrypoint can be written, composition needs a seam it can call — otherwise the only path is copy-pasting `main.ts`'s 130 lines.

`apps/api` already has the seam. `createApp({ reader, corsOrigin, exposeErrorDetails })` is a pure factory; `server.local.ts` loads config, builds the client and reader, serves, and handles SIGTERM. Adding a Lambda entrypoint there is roughly fifteen lines. The API never needed a second package, and this change gives the scraper the same treatment.

The governing principle: **package boundaries follow what changes together, and deployment target is a build-time choice — which entrypoint you bundle — not a package boundary.** Apply the test to the scraper. What makes you edit scraper composition? Adding a course. Does that change local and prod identically? Every time. Two packages would mean registering every new course twice, and the day they drift is the day local passes while prod silently scrapes seven courses. Runtime divergence is the bundler's job: a bundler tracing imports from a Lambda entrypoint never reaches `node-cron`, so scheduling code costs a Lambda bundle nothing.

Two facts from the code shape the design:

- `CourseConfig` (`packages/tee-time-domain/src/course-config.base.ts`) is already a **multi-consumer** shape. `maxAdvanceDays` and `releaseTime` appear nowhere in `scraper-core` outside the course files — only `bookable-dates.util.ts` reads them. The platform scrapers read `courseId`, `courseName`, `bookingPortalUrl`, and their own platform mechanics. So "every consumer reads every field" was never the contract; "facts about a course, each read by whoever cares" already is.
- `tee-time-domain` depends only on `zod`; `scraper-core` depends on `tee-time-domain`. Any type reachable from `CourseConfig` must live in `tee-time-domain`.

## Goals / Non-Goals

**Goals:**

- One scraper package with a shared composition factory, ready for a second entrypoint to call.
- Course/pricing drift becomes a compile error rather than a mid-run throw.
- Adding a course is one import and one array entry.
- Zero behavior change, verifiable by the existing local run.

**Non-Goals:**

- `handler.lambda.ts` and anything Lambda-specific. This change makes the entrypoint cheap to add; the follow-up adds it.
- Splitting config into base/extend schemas. Only one entrypoint exists, so a split would be speculative. It lands with the second entrypoint, which is what motivates it.
- Injectable Playwright launch options. `PlaywrightBrowserSession.launch()` still hardcodes `{ headless: true }` and takes no arguments. Running Chromium in Lambda will require supplying an `executablePath` and a specific `args` array, so launch options must eventually become a parameter. Independent of composition, and better decided once the Lambda Chromium approach is settled.
- esbuild bundling. No bundler exists in the repo yet.
- Whether a failed scrape should fail an invocation. `pipeline.run()` never throws on partial unit failure, so a Lambda would report success with all eight courses down. Real, but it is the handler's decision to make.

## Decisions

### Nest `pricing` into `CourseConfig`; move the types down to `tee-time-domain`

Every course needs a pricing config — `enrich` throws without one — so the relationship is mandatory. Expressing a mandatory relationship as two independently-authored exports paired by naming convention at the composition root means the compiler cannot help. Nesting makes `greenbryreConfig: ChronogolfV1CourseConfig` fail to typecheck without `pricing`.

The cost is that `CoursePricingConfig`, `PricingRule`, and `DynamicPricingTaxRule` must move from `scraper-core/src/domain/pricing-engine.ts` to `tee-time-domain/src/course-pricing-config.ts`, because `tee-time-domain` cannot import from `scraper-core`. Behavior (`PricingEngine`, `applyTax`, `resolveStatic`) stays put — only the shape moves.

**Alternative considered — `ScrapeableCourseConfig extends CourseConfig { pricing }` in `scraper-core`**, with the four platform configs extending it. Nothing moves packages; `tee-time-domain` stays pricing-free. Rejected: the boundary it protects is not load-bearing. `CourseConfig` is already effectively scraper-side — `apps/api` imports only `tee-time-reader` and `tee-time-schema`, and `apps/web` has its own constants — and it already lives in `tee-time-domain` next to a domain util that reads it. A moved `CoursePricingConfig` takes exactly that shape. The alternative buys purity and charges an extra interface layer.

**Alternative considered — keep the two exports, add a parity test** asserting the scraper configs and pricing map cover the same course IDs. Rejected: a test that catches a class of bug the type system can make unrepresentable is strictly weaker, and it still leaves adding a course a two-place edit.

**Rejected: `PricingEngine(configs: CourseConfig[])`.** Tempting once configs carry pricing, but it couples the engine to `CourseConfig` and forces `pricing-engine.test.ts`'s `engineFor(config)` helper (`:23`) to build eight fully-populated course configs to test tax math. Keeping the `ReadonlyMap<CourseId, CoursePricingConfig>` constructor costs one derivation line in the factory, and the map being *derived* is what makes drift impossible — not who holds it.

**Safety check, already performed:** no adapter spreads a course config into its output. Every `ScrapedTeeTime` is built field-by-field; TeeOn's `base` (`teeon-scraper.adapter.ts:143`) names each field explicitly and the spreads at `:154`/`:159` spread that object, not the config. So `pricing` has no path into a persisted record.

### The factory takes `writer` and `browserSession`, not `documentClient` and `tableName`

**Alternative considered — `createIngestionPipeline({ documentClient, tableName, logger, limiterConfig })`**, letting the factory build the writer itself. It reads naturally, and it is the shape you reach for first. Rejected because it contradicts the `createApp` precedent: `createApp` takes `reader` — a finished collaborator — not `documentClient` + `tableName`, precisely because `server.local.ts` must call `client.destroy()` and therefore owns the client and builds the reader from it. A factory handed a `documentClient` holds a resource whose lifetime it does not control.

The scraper has **two** closeable resources, not one, so the principle matters more here:

```
  ENTRYPOINT (owns lifecycles)              FACTORY (owns wiring)
  ────────────────────────────              ─────────────────────
  createDynamoDbClient() ──► client ✂       BottleneckRequestLimiter ×2
  PlaywrightBrowserSession.launch() ✂       Playwright/Http fetchers
  new DynamoDbTeeTimeWriter(client, table)  HostLimited* decorators
  new ConsoleLogger(level)                  4 platform scrapers + course registry
         │                                  TeeTimeOrchestrator
         │                                  PricingEngine
         └──── inject ──────────────────►   └─► IngestionPipeline
                                                     ✂ = must be closed
```

The governing rule: **the factory allocates nothing that must be closed.** Its payoff is that browser lifecycle — the one real local/Lambda difference — lands on the correct side of the line without the factory knowing runtimes exist:

```
  main.local.ts                        handler.lambda.ts  (follow-up)
  ─────────────                        ─────────────────
  launch session ──┐                   module scope: config, logger,
  build pipeline   │ ONCE at startup     documentClient, writer  ← warm reuse
  cron.schedule ───┘                   ─────────────────────────
    tick → run()                       per invocation:
    tick → run()   session stays warm    launch session
    tick → run()                         build pipeline
  SIGTERM → close                        try { run() } finally { close() }
```

Same signature, called once locally and once per invocation in Lambda. Rebuilding limiters per invocation is desirable anyway — fresh Bottleneck state.

### Course registry as per-platform arrays

With `pricing` nested, the registry stops being a structure and becomes the config arrays that already exist:

```ts
const chronogolfV1Configs = [greenbryreConfig, dakotaDunesConfig];
const chronogolfV2Configs = [theWillowsConfig];
const webtracConfigs = [holidayParkChampionshipConfig, holidayParkExecutive9Config, silverwoodConfig, wildwoodConfig];
const teeOnConfigs = [theLegendsConfig];

const allConfigs = [...chronogolfV1Configs, ...chronogolfV2Configs, ...webtracConfigs, ...teeOnConfigs];
const pricingEngine = new PricingEngine(new Map(allConfigs.map((c) => [c.courseId, c.pricing])));
```

This also halves `main.ts`'s import block: 16 named course imports (8 courses × 2 exports, lines 5–40) become 8.

### Factory lives in `apps/scraper`, not `scraper-core`

Genuinely arguable: `scraper-core` already knows Saskatoon's courses — the configs live at `platforms/*/courses/*` — so "which courses exist" is arguably library knowledge already. Decided for the app because the factory's job is wiring infrastructure adapters (transports, limiters, an injected writer) to domain services, which is a composition root's work, and because `scraper-core` should stay a library of platform capabilities that a composition selects from rather than one that names the selection.

### Keep one `config.ts`

Local needs `DYNAMODB_ENDPOINT` and `SCRAPE_CRON`; Lambda will need neither and will need `DYNAMODB_TABLE_NAME` without an endpoint. That argues for a shared base plus `.extend()` per runtime — but with one entrypoint, the split has nothing to discriminate between, and CLAUDE.md's "explicit configuration over magic defaults" is better served by splitting when the second runtime makes the difference concrete. Deferred, not forgotten.

## Risks / Trade-offs

- **Designing a factory for a consumer that does not exist yet.** → The "allocates nothing closeable" rule is derived from the API's already-shipped precedent, not from speculation about Lambda, and the follow-up's needs are concrete and small: module-scope config, logger, client, and writer for warm reuse; a per-invocation browser session closed in a `finally`. The signature is small enough to adjust if the follow-up disagrees.
- **The change grows past "pure refactor" — it touches `tee-time-domain`, all 8 course files, the engine's wiring, and a package rename.** → Still zero behavior change, and the pieces are independently verifiable: the type move and nesting typecheck on their own; the factory extraction is a code move; the rename is mechanical. Sequence them so each step compiles.
- **The TeeOn pricing follow-up may reshape `CoursePricingConfig`.** Guest pricing lives in the check-in endpoint, not the tee-time feed, and slot→variant resolution is unsolved. → Nesting forecloses nothing — a platform config can still add pricing fields beyond the base — but after this change that reshape lands in `tee-time-domain`. Worth knowing, not worth blocking on.
- **Renaming the package touches `pnpm-lock.yaml` and turbo's task graph.** → `apps/*` globbing means no workspace config edit; `pnpm install` regenerates the lock. Verified: nothing outside `apps/scraper-local` itself and the archived-change docs references the package by name, and no docker-compose service depends on it.
- **The 16→8 import collapse and the pricing type move together produce a wide diff across 8 course files.** → Each is a two-line edit (drop one import, fold one export into a field); the width is mechanical, not conceptual.

## Migration Plan

Ordered so every step compiles and the working tree is never half-migrated:

1. Add `course-pricing-config.ts` to `tee-time-domain` with the three moved types plus the package export entry; re-export or re-point `pricing-engine.ts` so nothing breaks yet.
2. Add required `pricing` to `CourseConfig`. This breaks all 8 course files — fix them in the same step by folding `xPricingConfig` into `xConfig.pricing` and deleting the second export.
3. Repoint `pricing-engine.test.ts:148` (`greenbryrePricingConfig` → `greenbryreConfig.pricing`) and `main.ts`'s Map.
4. Extract `createIngestionPipeline` from `main.ts` into `ingestion-pipeline.factory.ts` in place (still `apps/scraper-local`), leaving cron, the session launch/close, the client, and the writer in `main.ts`.
5. Rename the package and directory, rename `main.ts` → `main.local.ts`, update `dev`/`start` scripts, `pnpm install`.
6. Delete `apps/scraper-lambda`.

**Rollback:** no data migration, no deployed surface, no persisted-schema change — `TeeTime` is untouched. Revert the commit.

**Verification:** `pnpm format`, `pnpm check-types`, `pnpm lint`, `pnpm test`, plus a local run against docker-compose `dynamodb-local` scraping all 8 courses and persisting as before.

## Open Questions

- Does the factory's `limiterConfig` parameter stay a pre-built object assembled by each entrypoint from flat env values, or does the factory take the flat config and assemble it? The former duplicates ~10 lines of mapping in the second entrypoint; the latter gives the factory a config-shaped parameter it must know the schema of. Leaning toward a shared `toLimiterConfig(config)` helper once the base/extend split exists — decidable now, but cheaper to decide with the second entrypoint in front of us.
