## 1. Create `packages/tee-time-domain` (pure)

- [ ] 1.1 Scaffold the package: `package.json` (name `@stt/tee-time-domain`, `type: module`, `private`, `zod` as the only runtime dep, standard `check-types`/`lint`/`test` scripts and `@stt/eslint-config`/`@stt/typescript-config`/`eslint`/`typescript`/`vitest` dev deps), `tsconfig.json` extending `@stt/typescript-config`, and an empty `exports` map to fill in.
- [ ] 1.2 Move the pure sources from `packages/scraper-core/src/domain/` into `packages/tee-time-domain/src/`, with their co-located tests: `tee-time.schema.ts` (+ `.test.ts`), `primitives.schema.ts`, `course-config.base.ts`, `logger.port.ts`, `bookable-dates.util.ts` (+ `.test.ts`), `local-start-instant.util.ts`, `best-booking-url.util.ts`.
- [ ] 1.3 Rename the persistence port into this package as `tee-time-writer.port.ts`: interface `TeeTimeRepository` → `TeeTimeWriter`; keep `ScrapeUnitKey` defined here and `replaceUnitTeeTimes` unchanged. Retarget its imports (`primitives.schema`, `tee-time.schema`) to intra-package relative paths.
- [ ] 1.4 Fix intra-package relative imports among the moved files and define the `exports` map keys for every symbol consumed by other packages (`tee-time-schema`, `primitives-schema`, `course-config`, `logger`, `tee-time-writer`, `bookable-dates`, `local-start-instant`, `best-booking-url`).
- [ ] 1.5 Confirm no `@aws-sdk/*`, `cheerio`, `playwright-core`, or `bottleneck` import remains in this package.

## 2. Create `packages/tee-time-persistence` (DynamoDB infrastructure)

- [ ] 2.1 Scaffold the package: `package.json` (name `@stt/tee-time-persistence`, deps `@stt/tee-time-domain` workspace, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `zod` if needed; dev deps including `testcontainers`), `tsconfig.json`, `vitest.integration.config.ts` (mirroring scraper-core's), and `test`/`test:integration`/`check-types`/`lint` scripts.
- [ ] 2.2 Move `dynamodb-tee-time-table.ts` into `packages/tee-time-persistence/src/`.
- [ ] 2.3 Move and rename the write adapter to `dynamodb-tee-time-writer.adapter.ts`: class `DynamoDbTeeTimeRepository` → `DynamoDbTeeTimeWriter`, implementing `TeeTimeWriter` from `@stt/tee-time-domain`. Move its integration test as `dynamodb-tee-time-writer.adapter.integration.test.ts` and retarget its imports.
- [ ] 2.4 Add `dynamodb-client.factory.ts` with the discriminated-mode config: `type DynamoDbClientConfig = { mode: 'local'; endpoint: string } | { mode: 'aws'; region?: string }` and `createDynamoDbClient(config)` returning `{ client, documentClient }`. Local branch sets `endpoint`, `region: 'local'`, dummy credentials; aws branch passes `region` only when provided. Centralize a shared `TRANSLATE_CONFIG` (marshalling options) applied via `DynamoDBDocumentClient.from(...)`.
- [ ] 2.5 Define the `exports` map: `./tee-time-table`, `./dynamodb-tee-time-writer`, `./dynamodb-client-factory`.

## 3. Slim `packages/scraper-core` to scraping only

- [ ] 3.1 Delete the moved sources/tests from `scraper-core/src/domain/` and `scraper-core/src/persistence/` (everything now living in the two new packages).
- [ ] 3.2 Retarget all remaining `scraper-core` internal imports (ingestion-pipeline, tee-time-orchestrator, pricing-engine, booking-platform-scraper.port, platforms/*, transport/*, course configs) to `@stt/tee-time-domain` and `@stt/tee-time-persistence`.
- [ ] 3.3 Update `scraper-core/package.json`: add `@stt/tee-time-domain` and `@stt/tee-time-persistence` workspace deps; remove now-unused deps if fully relocated; keep `cheerio`/`playwright-core`/`bottleneck`/AWS SDK only where still imported.
- [ ] 3.4 Update `scraper-core`'s `exports` map: remove the persistence/domain keys that pointed at moved files (`./persistence/dynamodb-tee-time-repository`, `./persistence/tee-time-table`, `./domain/logger`); retain scraping exports (`./domain/ingestion-pipeline`, `./domain/tee-time-orchestrator`, `./domain/pricing-engine`, `./platforms/*`, `./transport/*`).

## 4. Retarget `apps/scraper-local`

- [ ] 4.1 Update `main.ts` imports: `DynamoDbTeeTimeWriter` and `createDynamoDbClient` from `@stt/tee-time-persistence`; `Logger` from `@stt/tee-time-domain`; scraping symbols still from `@stt/scraper-core`.
- [ ] 4.2 Build the discriminated-mode config in `main.ts`: `createDynamoDbClient({ mode: 'local', endpoint: config.DYNAMODB_ENDPOINT })`; rename the local variable `repository` → `writer` where it reflects the new port name (keep behavior identical). Leave the Zod env schema in `config.ts` unchanged.
- [ ] 4.3 Update `dynamodb-setup.ts`: remove the local `createDynamoDbClient` (now imported from `tee-time-persistence`); keep `ensureTeeTimeTable`, importing `TEE_TIME_TABLE_*` constants from `@stt/tee-time-persistence`.
- [ ] 4.4 Update `apps/scraper-local/package.json` deps: add `@stt/tee-time-domain` and `@stt/tee-time-persistence`; drop AWS SDK deps only if no longer directly imported (`dynamodb-setup.ts` still uses `@aws-sdk/client-dynamodb` for control-plane commands, so keep it).

## 5. Wire workspace and verify

- [ ] 5.1 Run `pnpm install` to link the new workspace packages and resolve references; confirm the dependency graph is acyclic and points inward (`scraper-local → scraper-core → tee-time-persistence → tee-time-domain`).
- [ ] 5.2 Run `pnpm format && pnpm check-types && pnpm lint` across the workspace; fix any missed import or naming fallout.
- [ ] 5.3 Run `pnpm test && pnpm test:integration`; confirm all suites (including the relocated DynamoDB writer integration test) pass with no functional change.
