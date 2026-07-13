## 1. Read-side port (domain)

- [x] 1.1 Add `tee-time-reader.port.ts` to `@stt/tee-time-domain` defining `TeeTimeReader` with `readTeeTimesForDate(date: string): Promise<readonly TeeTime[]>`, documented in the JSDoc house style
- [x] 1.2 Add the `./tee-time-reader` entry to the domain package's `exports` map

## 2. DynamoDB reader adapter (persistence)

- [x] 2.1 Add `dynamodb-tee-time-reader.adapter.ts` implementing `TeeTimeReader` via a single paged `QueryCommand` on `TEE_TIME_TABLE_PARTITION_KEY`, reconstructing each `TeeTime` by parsing the item through the `TeeTime` schema (dropping `PK`/`SK`/`ttl`)
- [x] 2.2 Resolve `ResourceNotFoundException` to an empty list; let other errors propagate
- [x] 2.3 Add the `./dynamodb-tee-time-reader` entry to the persistence package's `exports` map
- [x] 2.4 Add an integration test (mirroring the writer's testcontainers setup) covering: multi-course date returns all items, empty date returns `[]`, large partition is fully paged, and missing table returns `[]`

## 3. API app scaffolding

- [ ] 3.1 Flesh out `apps/api/package.json`: scripts (`dev`, `start`, `test`, `check-types`, `lint`) mirroring `scraper-local`; dependencies `hono`, `@hono/node-server`, `@stt/tee-time-domain`, `@stt/tee-time-persistence`, `zod`; matching devDependencies (tsx, vitest, eslint/ts configs, `@types/node`)
- [ ] 3.2 Add `apps/api/tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, and `.env.example` following the `scraper-local` conventions
- [ ] 3.3 Add `apps/api/src/config.ts`: Zod env schema (`PORT`, `DYNAMODB_ENDPOINT`, `DYNAMODB_TABLE_NAME`, `LOG_LEVEL`) with inline defaults, `safeParse` + `z.prettifyError`, exported `loadConfig()` and config type

## 4. HTTP app and endpoint

- [ ] 4.1 Add `apps/api/src/app.ts` exporting `createApp({ reader }: AppDeps): Hono`, registering `cors()` and `logger()` middleware
- [ ] 4.2 Implement `GET /tee-times`: validate required `date` (`YYYY-MM-DD`, real calendar date) with a Zod schema, returning `400` (prettified message) on missing/malformed input
- [ ] 4.3 On valid input, call `reader.readTeeTimesForDate(date)` and respond `200` with `{ teeTimes, lastUpdatedAt }` where `lastUpdatedAt` is the max `scrapedAt` (or `null` when empty)

## 5. Local server entrypoint

- [ ] 5.1 Add `apps/api/src/server.local.ts` composition root: `loadConfig()` → `createDynamoDbClient({ mode: 'local', endpoint })` → `new DynamoDbTeeTimeReader(...)` → `createApp(...)` → serve via `@hono/node-server` on `PORT`
- [ ] 5.2 Log a startup line (endpoint, table, port) and handle graceful shutdown (SIGINT/SIGTERM close the server and destroy the client)

## 6. Tests

- [ ] 6.1 Add app-level tests hitting `createApp` with an in-memory fake `TeeTimeReader`: `200` envelope shape, `lastUpdatedAt` = max `scrapedAt`, `null` for empty result, `400` on missing date, `400` on malformed date

## 7. Verify

- [ ] 7.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors
- [ ] 7.2 With local DynamoDB and `scraper-local` running, start the API and confirm `GET /tee-times?date=<date>` returns the envelope and a bad/missing date returns `400`
