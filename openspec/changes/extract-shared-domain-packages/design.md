## Context

All shared building blocks currently live inside `@stt/scraper-core`: the canonical `TeeTime`/primitives schemas, `course-config.base`, the `Logger` port, the persistence port (`TeeTimeRepository`), the DynamoDB write adapter, the table key constants, and several pure domain utilities. That package's `package.json` also declares `@aws-sdk/*`, `cheerio`, `playwright-core`, and `bottleneck`. A future read/serving API needs only the shared types and the DynamoDB read/write infrastructure; reusing `scraper-core` would force it to inherit the full scraping toolchain, violating CLAUDE.md's "dependencies point inward" and hexagonal-layering principles.

Current relevant state:

- `packages/scraper-core/src/domain/` holds schemas, ports, and utils mixed with scraping domain services (`ingestion-pipeline`, `tee-time-orchestrator`, `pricing-engine`, `booking-platform-scraper.port`).
- `packages/scraper-core/src/persistence/` holds `tee-time-repository.port.ts`, `dynamodb-tee-time-repository.adapter.ts` (+ integration test), and `dynamodb-tee-time-table.ts`.
- `apps/scraper-local/src/dynamodb-setup.ts` defines `createDynamoDbClient` (hardcoded local endpoint, dummy creds, `region: 'local'`, no marshalling config) plus `ensureTeeTimeTable` (local bootstrap).
- No barrel files: every package's public surface is its `package.json` `exports` map.

## Goals / Non-Goals

**Goals:**

- Extract two shared packages split on the domain-vs-infrastructure line:
  - `packages/tee-time-domain` — **pure**, no AWS/Cheerio/Playwright/Bottleneck.
  - `packages/tee-time-persistence` — DynamoDB infrastructure, depends only on `tee-time-domain`.
- Establish and hold the dependency arrow: `apps/scraper-local → scraper-core → tee-time-persistence → tee-time-domain`, with `tee-time-domain` at the pure leaf.
- Promote the DynamoDB client factory into `tee-time-persistence` and make it prod-capable via an explicit discriminated-mode config, centralizing the `DocumentClient` marshalling config.
- Rename the write-side port (`TeeTimeRepository` → `TeeTimeWriter` and companions) to remove the read/write naming asymmetry before a future reader port lands.
- Preserve all runtime behavior. The change is mechanical: move + rename + rewire.

**Non-Goals:**

- No `TeeTimeReader` port, DynamoDB reader adapter, `apps/api` Hono app, node-server entrypoint, API config, CORS, or health endpoint (all deferred to the follow-up API change).
- No re-validation of items read from DynamoDB (a read-path concern).
- No behavioral change to scraping, pricing, orchestration, or persistence semantics.
- No changes to `apps/scraper-local`'s Zod env schema — only its `main.ts` wiring line.

## Decisions

### Two packages, split on domain vs infrastructure

**Decision:** Create `tee-time-domain` (pure) and `tee-time-persistence` (DynamoDB infra) as separate packages.

- `tee-time-domain` gets: `tee-time.schema.ts`, `primitives.schema.ts`, `course-config.base.ts`, `logger.port.ts`, the renamed writer port, and the pure utils `bookable-dates.util.ts`, `local-start-instant.util.ts`, `best-booking-url.util.ts` (with their co-located tests). Its `package.json` declares only `zod`.
- `tee-time-persistence` gets: `dynamodb-tee-time-table.ts`, the renamed DynamoDB write adapter (+ its integration test), and the promoted `dynamodb-client.factory.ts`. It depends on `tee-time-domain` and `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`.

**Alternatives considered:**

- *Keep everything in `scraper-core`* — rejected: drags the scraping dependency tree into the future API.
- *Single `tee-time-domain` package with `./domain/*` and `./persistence/*` subpaths* — rejected: code layering would look clean, but that one package's `package.json` still ships the AWS SDK, so the "domain" import is not actually pure. The two-package split makes purity honest and enforceable at the dependency-graph level.

### DynamoDB client factory: explicit discriminated-mode config

**Decision:** A single factory in `tee-time-persistence` taking a discriminated-union config, returning both the base client and the document client.

```ts
export type DynamoDbClientConfig =
  | { mode: 'local'; endpoint: string }
  | { mode: 'aws'; region?: string };

export function createDynamoDbClient(config: DynamoDbClientConfig): {
  client: DynamoDBClient;
  documentClient: DynamoDBDocumentClient;
};
```

- Local and prod client construction genuinely diverge and that divergence is irreducible: local MUST override the endpoint and supply dummy creds + `region: 'local'`; prod MUST be near-zero-config so Lambda's execution role and auto-injected `AWS_REGION` resolve naturally. The factory centralizes that single branch rather than making the two identical.
- The one thing that MUST be mirrored across environments is the `DocumentClient` marshalling config (`marshallOptions`/`unmarshallOptions`, e.g. `removeUndefinedValues`). Centralizing it here guarantees items serialize identically in local and prod. (Today's local factory passes no translate config; the promoted factory adds a shared `TRANSLATE_CONFIG`.)
- Return **both** clients: `scraper-local` needs the base `client` for control-plane ops (`ensureTeeTimeTable`, `waitUntilTableExists`, `client.destroy()`); the future API uses `documentClient` and `client.destroy()` on shutdown.
- **Mode is a runtime dimension of the composition root, not an env var.** `scraper-local` is inherently local-only, so its `main.ts` hardcodes `mode: 'local'` and maps the existing `DYNAMODB_ENDPOINT` → `{ mode: 'local', endpoint }`. This gives a nice safety property: `scraper-local` can never accidentally hit real AWS.

**Alternatives considered:**

- *Optional `endpoint` implicitly drives the branch* — rejected: implicit, violates "explicit over implicit / fail loudly."
- *Two named factories (`createLocalClient` / `createAwsClient`)* — rejected: repeats the branch at every composition root.

### `ensureTeeTimeTable` stays in `apps/scraper-local`

**Decision:** The table-bootstrap helper is local-only and does not move into the factory or the shared package. Production provisions the table via OpenTofu and the API assumes it exists; only the local runtime creates tables. After the move, `ensureTeeTimeTable` imports the table key constants from `tee-time-persistence` instead of `scraper-core`.

### Port rename: `Repository` → `Writer`

**Decision:** Rename to name the write side explicitly ahead of a future read side.

| From | To |
| --- | --- |
| `tee-time-repository.port.ts` | `tee-time-writer.port.ts` |
| interface `TeeTimeRepository` | interface `TeeTimeWriter` |
| class `DynamoDbTeeTimeRepository` | class `DynamoDbTeeTimeWriter` |
| `dynamodb-tee-time-repository.adapter.ts` | `dynamodb-tee-time-writer.adapter.ts` |
| exports key `./persistence/dynamodb-tee-time-repository` | `./persistence/dynamodb-tee-time-writer` |

- `ScrapeUnitKey` stays defined **with the writer port** (it is the write unit) and moves to `tee-time-domain`.
- The `replaceUnitTeeTimes` method name is unchanged.
- The integration test file renames alongside its adapter (`dynamodb-tee-time-writer.adapter.integration.test.ts`).

**Accepted downsides:** loses the familiar DDD "Repository" term; adds churn to an already file-heavy refactor; briefly leaves a `Writer` with no `Reader` sibling until the API change (intentional forward-naming that avoids a second rename).

### Package naming, exports, and workspace wiring

- Package names follow the existing `@stt/*` convention: `@stt/tee-time-domain`, `@stt/tee-time-persistence`.
- Each new package mirrors `scraper-core`'s setup: `package.json` with `exports` map (no barrel), `tsconfig.json` extending `@stt/typescript-config`, `eslint`/`vitest` scripts, and co-located `*.test.ts`. `tee-time-persistence` also carries the `vitest.integration.config.ts` needed by the moved integration test (`testcontainers`).
- Exports maps to define:
  - `tee-time-domain`: `./tee-time-schema`, `./primitives-schema`, `./course-config`, `./logger`, `./tee-time-writer`, `./bookable-dates`, `./local-start-instant`, `./best-booking-url` (exact keys finalized against actual internal import needs during implementation).
  - `tee-time-persistence`: `./tee-time-table`, `./dynamodb-tee-time-writer`, `./dynamodb-client-factory`.
- `scraper-core` retains only scraping exports (`./domain/ingestion-pipeline`, `./domain/tee-time-orchestrator`, `./domain/pricing-engine`, `./platforms/*`, `./transport/*`) and re-points its remaining `./domain/logger` consumers at the domain package. Its `exports` keys that pointed at moved files are removed.

## Risks / Trade-offs

- **Broad, file-heavy diff touching many imports** → Keep the change strictly mechanical (move + rename + rewire, no logic edits); lean on the full done gate (`format`, `check-types`, `lint`, `test`, `test:integration`) to catch any missed import or broken reference.
- **Accidental dependency leak (AWS SDK into `tee-time-domain`)** → `tee-time-domain`'s `package.json` deliberately declares only `zod`; a stray AWS import fails `check-types`/`lint` at the package boundary, making the leak loud rather than silent.
- **Marshalling-config drift when adding `TRANSLATE_CONFIG`** → The local factory currently passes no translate config; introducing a shared config is a behavior-adjacent change. Verify the integration test still passes and that no scraper item shape depends on the previous default marshalling.
- **Circular or misordered workspace references** → Wire deps strictly inward (`scraper-core → tee-time-persistence → tee-time-domain`); `pnpm install` + `check-types` surface any cycle.
- **Integration test tooling moves with its adapter** → The DynamoDB adapter integration test depends on `testcontainers` and a separate vitest config; ensure both move to `tee-time-persistence` so `pnpm test:integration` still discovers and runs it.

## Migration Plan

Behavior-preserving refactor; no runtime migration or data change. Sequence:

1. Create `packages/tee-time-domain`; move the pure sources + tests; author its `package.json` (dep: `zod` only), `tsconfig`, `exports` map.
2. Create `packages/tee-time-persistence`; move the table constants, the renamed writer adapter (+ integration test + integration vitest config); add the promoted prod-capable `dynamodb-client.factory.ts`; depend on `tee-time-domain` + AWS SDK.
3. Apply the port rename across files, class/interface names, and exports keys.
4. Slim `scraper-core`: delete moved files, retarget internal imports to the two new packages, update its `exports` map and `package.json` deps.
5. Retarget `apps/scraper-local` imports; update `main.ts` to build the discriminated-mode config and import `createDynamoDbClient` from `tee-time-persistence`; keep `ensureTeeTimeTable` local (now importing table keys from `tee-time-persistence`).
6. Run the full done gate; fix any fallout.

Rollback is a plain `git revert` — no state to unwind.

## Open Questions

- None blocking. Exact `exports`-map keys for the new packages will be finalized against the real internal import needs discovered while retargeting, without changing the design.
