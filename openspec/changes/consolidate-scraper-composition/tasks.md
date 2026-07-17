## 1. Move pricing config types to the domain package

- [x] 1.1 Create `packages/tee-time-domain/src/course-pricing-config.ts` holding `DynamicPricingTaxRule`, `PricingRule`, and `CoursePricingConfig`, moved verbatim (with their JSDoc) from `packages/scraper-core/src/domain/pricing-engine.ts`
- [x] 1.2 Add `"./course-pricing-config": "./src/course-pricing-config.ts"` to `packages/tee-time-domain/package.json`'s exports map
- [x] 1.3 Delete the three type declarations from `pricing-engine.ts` and import `CoursePricingConfig` from `@stt/tee-time-domain/course-pricing-config`; keep `PricingEngine`, `applyTax`, and `resolveStatic` where they are, and keep the constructor's `ReadonlyMap<CourseId, CoursePricingConfig>` parameter unchanged
- [x] 1.4 Run `pnpm check-types` — the package must build with the types relocated and no behavior touched

## 2. Nest pricing into course config

- [x] 2.1 Add required `pricing: CoursePricingConfig` to `CourseConfig` in `packages/tee-time-domain/src/course-config.base.ts`, importing from `./course-pricing-config.js` and documenting it alongside `timeZone`/`maxAdvanceDays`/`releaseTime`
- [x] 2.2 Fold `greenbryrePricingConfig` into `greenbryreConfig.pricing` and delete the second export (`platforms/chronogolf-v1/courses/greenbryre.ts`)
- [x] 2.3 Fold `dakotaDunesPricingConfig` into `dakotaDunesConfig.pricing` and delete the second export (`platforms/chronogolf-v1/courses/dakota-dunes.ts`)
- [x] 2.4 Fold `theWillowsPricingConfig` into `theWillowsConfig.pricing` and delete the second export (`platforms/chronogolf-v2/courses/the-willows.ts`)
- [x] 2.5 Fold the four WebTrac courses' pricing configs into their configs and delete the second exports (`holiday-park-championship.ts`, `holiday-park-executive-9.ts`, `silverwood.ts`, `wildwood.ts`)
- [x] 2.6 Fold `theLegendsPricingConfig` into `theLegendsConfig.pricing` and delete the second export (`platforms/teeon/courses/the-legends.ts`)
- [x] 2.7 Preserve each course's existing pricing JSDoc by folding it onto the `pricing` field rather than dropping it
- [x] 2.8 Repoint `pricing-engine.test.ts:148` from `greenbryrePricingConfig` to `greenbryreConfig.pricing`, leaving the `engineFor(config)` helper (`:23`) taking a bare `CoursePricingConfig`
- [x] 2.9 Repoint `apps/scraper-local/src/main.ts`'s pricing `Map` and drop the 8 now-deleted `xPricingConfig` imports
- [x] 2.10 Run `pnpm check-types` and `pnpm test` — verify a course config authored without `pricing` fails to compile

## 3. Extract the composition factory

- [x] 3.1 Create `apps/scraper-local/src/ingestion-pipeline.factory.ts` exporting `createIngestionPipeline({ writer, browserSession, logger, limiterConfig }): IngestionPipeline` with a `deps` interface mirroring `apps/api/src/app.ts`'s `AppDeps`
- [x] 3.2 Move into the factory: both `BottleneckRequestLimiter` instances (preserving the browser-stack vs plain-fetch split and its comments), the fetchers, the `HostLimited*` decorators, the 4 platform scrapers, the `TeeTimeOrchestrator`, and the `PricingEngine`
- [x] 3.3 Structure the course registry as per-platform config arrays flattened into `allConfigs`, deriving the pricing map via `new Map(allConfigs.map((c) => [c.courseId, c.pricing]))`
- [x] 3.4 Verify the factory constructs nothing closeable — no `createDynamoDbClient`, no `PlaywrightBrowserSession.launch()`, no writer construction from a client and table name
- [x] 3.5 Reduce `main.ts` to: `loadConfig`, logger, client, `ensureTeeTimeTable`, session launch, writer, `createIngestionPipeline`, cron setup, shutdown — keeping the existing SIGINT/SIGTERM path closing the task, session, and client
- [x] 3.6 Run `pnpm check-types`, `pnpm lint`, `pnpm test`

## 4. Consolidate the packages

- [x] 4.1 Rename `apps/scraper-local` → `apps/scraper` and set the package name to `scraper`
- [x] 4.2 Rename `src/main.ts` → `src/main.local.ts` and update the `dev` and `start` scripts to point at it
- [x] 4.3 Update the startup log line in `main.local.ts` that reports `scraper-local started`
- [x] 4.4 Delete the `apps/scraper-lambda` stub package
- [x] 4.5 Run `pnpm install` to regenerate `pnpm-lock.yaml` for the renamed and removed packages
- [x] 4.6 Confirm nothing else references the old package names — `.env`/`.env.example` carry over, and no docker-compose service or turbo config names them

## 5. Verify and document

- [x] 5.1 Run `pnpm format`, `pnpm check-types`, `pnpm lint`, and `pnpm test` across the monorepo; fix any errors
- [x] 5.2 Run the scraper locally against docker-compose `dynamodb-local` and confirm all 8 courses scrape and persist as before — this is the change's no-behavior-change verification
- [x] 5.3 Run `openspec validate consolidate-scraper-composition`
