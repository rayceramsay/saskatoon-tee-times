## Context

The scraper (`scraper-local` + `@stt/scraper-core`) writes `TeeTime` records into DynamoDB via the `TeeTimeWriter` port and its `DynamoDbTeeTimeWriter` adapter. Persistence is intentionally write-only today: the port was named `Writer` rather than `Repository` to leave room for a read side without a lopsided naming pair. `apps/api` is an empty stub. The table (`@stt/tee-time-persistence`) is keyed `PK = date` (`YYYY-MM-DD`), `SK = courseId#startInstant#holes#routing`, so a whole date lives in a single partition — the shape this API reads from.

The project is a pnpm/turborepo monorepo following hexagonal architecture with dependency injection: ports live in `@stt/tee-time-domain`, adapters in infrastructure packages, and each app has a composition root that wires them. `scraper-local` is the reference for these patterns (Zod env config, `createDynamoDbClient` factory, DI in `main.ts`).

## Goals / Non-Goals

**Goals:**

- A read side in persistence mirroring the write side: `TeeTimeReader` port + `DynamoDbTeeTimeReader` adapter reading a full date from one partition.
- A Hono `GET /tee-times?date=YYYY-MM-DD` endpoint returning `{ date, teeTimes, lastUpdatedAt }`, runnable locally against the scraper's DynamoDB.
- Structure the app so a future AWS Lambda handler is additive, not a rewrite.
- Match the existing app's conventions so the codebase reads as one system.

**Non-Goals:**

- AWS Lambda handler, Function URL, or any deployment/IaC.
- Server-side filtering (course/holes/group/start time) and "current date" defaulting — both are frontend concerns.
- A read-side caching layer, pagination of the HTTP response, or auth.
- Changing the write side or the table schema.

## Decisions

### Read port shape: `readTeeTimesForDate(date) → readonly TeeTime[]`

A single method keyed by `YYYY-MM-DD`, returning the canonical `TeeTime` set. It mirrors `TeeTimeWriter`'s minimal surface. `lastUpdatedAt` is **not** part of the port — it is derived in the HTTP layer from the returned set (max `scrapedAt`), keeping the port a pure data-access seam. Alternative considered: a richer read model returning `{ teeTimes, lastUpdatedAt }` from the port — rejected because freshness is a presentation concern, and deriving it above the port keeps persistence free of envelope semantics.

### DynamoDB reader: single `Query` on the date partition, paged

The adapter issues `QueryCommand` with `KeyConditionExpression: #pk = :date`, paging on `LastEvaluatedKey` until exhausted, and reconstructs each `TeeTime` from the item. Because a date is one partition, no scan or GSI is needed. It reuses `TEE_TIME_TABLE_PARTITION_KEY` and the `createDynamoDbClient` factory, staying symmetric with the writer. Stored items carry key/TTL attributes (`PK`, `SK`, `ttl`) alongside the `TeeTime` fields; the reader SHALL project/parse back to a clean `TeeTime` (validated via the `TeeTime` Zod schema) rather than leaking storage attributes outward.

### Missing table → empty list

A `ResourceNotFoundException` from the query resolves to `[]` rather than propagating. This lets the API start before the scraper has provisioned the table (the scraper owns table creation) without a hard crash — a graceful-degradation choice for local DX. Any other error still propagates. Alternative: have the API also ensure the table — rejected, as schema ownership belongs to the write side.

### Hono app: `createApp(deps)` factory + `server.local.ts` entrypoint

`app.ts` exports `createApp({ reader }: AppDeps): Hono` — a pure factory that registers middleware and routes and takes its reader by injection. `server.local.ts` is the composition root: `loadConfig()` → `createDynamoDbClient({ mode: 'local', ... })` → `new DynamoDbTeeTimeReader(...)` → `createApp(...)` → `serve` via `@hono/node-server`. This is the same factory/entrypoint split the eventual Lambda would reuse — the future `handler.lambda.ts` calls the same `createApp` with an `aws`-mode client and wraps it in Hono's `aws-lambda` adapter, no restructuring. Alternative: a single `main.ts` that both builds and serves — rejected because it welds the transport to the app and blocks the Lambda seam.

### Request validation with Zod at the route boundary

The `date` query param is validated by a Zod schema requiring a real `YYYY-MM-DD` calendar date; failure returns `400` with a prettified message (consistent with `loadConfig`'s `z.prettifyError` style). Missing and malformed dates are the same rejection path. This keeps the "required, strict" contract in one schema.

### Middleware: `cors()` and `logger()`

`hono/cors` is enabled so the local frontend (`:3000`) can call the API on its own port; in production the frontend is same-origin behind CloudFront `/api/*`, so CORS is effectively a local-only affordance. `hono/logger` provides HTTP access logging. The domain `Logger` port is intentionally not pulled in yet — there is no domain-level logging in a pass-through read path; request logging suffices.

### Config via Zod env schema

`apps/api/src/config.ts` follows the established pattern: one `z.object` keyed by `UPPERCASE_SNAKE_CASE` env vars with inline defaults — `PORT`, `DYNAMODB_ENDPOINT`, `DYNAMODB_TABLE_NAME`, `LOG_LEVEL` — parsed with `safeParse` and surfaced via `z.prettifyError` on failure.

## Risks / Trade-offs

- **Storage attributes leaking into the API response** → the reader parses each item back through the `TeeTime` schema, dropping `PK`/`SK`/`ttl`, so the HTTP contract exposes only canonical `TeeTime` fields.
- **`ResourceNotFound`-as-empty masking a real misconfiguration** (e.g. wrong table name in prod) → scope this leniency to the read path and document it; the empty result is correct locally, and prod wiring is validated when the Lambda seam is added.
- **Reader/writer key logic drifting** (routing/sort-key encoding) → the reader depends only on the partition key for reads and reconstructs `TeeTime` from stored attributes, so it does not re-parse the composite sort key; the shared `dynamodb-tee-time-table.ts` constants remain the single source of truth.
- **CORS misconfigured too permissively** → local dev uses a permissive origin; when the Lambda seam lands, production CORS is revisited (or omitted entirely since same-origin), so the permissive setting stays confined to local.

## Migration Plan

Additive only — no existing behavior changes. New domain export (`TeeTimeReader` port), new persistence export (`DynamoDbTeeTimeReader`), and a fleshed-out `apps/api`. Local run order: start local DynamoDB and `scraper-local` (which provisions and populates the table), then start the API. No rollback concerns; deleting the new files reverts cleanly.

## Open Questions

- Endpoint path/versioning: `GET /tee-times` now; whether to prefix (`/api/...` is added by CloudFront routing, not the app) is deferred to the Lambda/deploy change.
- Local API port default (e.g. `8787`) — pick a non-conflicting default in `config.ts`; not contract-significant.
