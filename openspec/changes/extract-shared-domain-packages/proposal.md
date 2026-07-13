## Why

The scraping pipeline is mature and the next lane of work is a read/serving API. Today all shared building blocks — the canonical `TeeTime` schema, primitives, the persistence port, and the DynamoDB adapter/table keys — live inside `@stt/scraper-core`, whose `package.json` also ships Cheerio, Playwright, and Bottleneck. Any future `apps/api` that reused those types would inherit the entire scraping dependency tree. Extracting the shared domain and persistence code into their own packages now gives the upcoming API a lean, honest dependency graph and restores the "dependencies point inward" rule before more code accretes on the current shape.

## What Changes

- Introduce `packages/tee-time-domain`: a **pure** package (no `@aws-sdk/*`, Cheerio, Playwright, or Bottleneck) holding the tee-time/primitives schemas, `course-config.base`, the `Logger` port, the persistence write port, and the pure domain utilities (`bookable-dates`, `local-start-instant`, `best-booking-url`).
- Introduce `packages/tee-time-persistence`: the shared DynamoDB **infrastructure** package (depends on `tee-time-domain`) holding the table key constants, the DynamoDB write adapter, and a promoted, prod-capable DynamoDB client factory.
- Move the DynamoDB client factory out of `apps/scraper-local` into `tee-time-persistence` and make it prod-capable via an explicit discriminated-mode config (`{ mode: 'local'; endpoint }` | `{ mode: 'aws'; region? }`). `ensureTeeTimeTable` (local bootstrap) stays in `apps/scraper-local`.
- **Rename** the write-side port to remove the `Repository` term ahead of a future `TeeTimeReader`: `TeeTimeRepository` → `TeeTimeWriter`, `DynamoDbTeeTimeRepository` → `DynamoDbTeeTimeWriter`, and the corresponding files/exports-map keys. `ScrapeUnitKey` and the `replaceUnitTeeTimes` method name are unchanged.
- Slim `@stt/scraper-core` to scraping only (platforms, transport, ingestion-pipeline, orchestrator, pricing-engine); retarget its internal imports and `exports` map and add dependencies on the two new packages.
- Retarget `apps/scraper-local` imports to the new packages.

This change is **behavior-preserving**: no runtime behavior of the scraper changes. It is pure package extraction plus a rename.

## Capabilities

### New Capabilities

- None. Package extraction is structural (no new spec-level behavior); it is captured in design and tasks.

### Modified Capabilities

- `tee-time-persistence`: the named *"Tee-time repository port"* requirement (SHALL define a `TeeTimeRepository` port) is renamed to a `TeeTimeWriter` port. The port's contract — transport-agnostic, snapshot-replace keyed by `(courseId, date)` — is unchanged; only the named port identifier changes.

## Impact

- **New packages**: `packages/tee-time-domain`, `packages/tee-time-persistence` (each with its own `package.json` `exports` map, `tsconfig`, and co-located tests).
- **`packages/scraper-core`**: loses domain + persistence source; gains workspace deps on the two new packages; `exports` map and internal imports retargeted.
- **`apps/scraper-local`**: imports retargeted; `main.ts` wiring builds the discriminated-mode client config; `createDynamoDbClient` no longer defined locally (imported from `tee-time-persistence`).
- **Dependency graph** (must hold): `apps/scraper-local → scraper-core → tee-time-persistence → tee-time-domain`. `tee-time-domain` carries none of the scraping/AWS dependencies.
- **Done gate**: `pnpm format && pnpm check-types && pnpm lint && pnpm test && pnpm test:integration` all pass with no functional change.
- **Out of scope** (deferred to the follow-up API change): `TeeTimeReader` port, DynamoDB reader adapter, `apps/api` Hono app, node-server entrypoint, API config, CORS, health endpoint.
