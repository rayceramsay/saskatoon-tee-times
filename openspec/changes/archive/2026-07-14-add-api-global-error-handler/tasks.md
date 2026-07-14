## 1. Config flag

- [x] 1.1 Add an `EXPOSE_ERROR_DETAILS` key to `apps/api/src/config.ts`'s Zod env schema — boolean, **default `false`** — using the same coercion/`safeParse`/`z.prettifyError` style as the existing keys, so it flows through `loadConfig()` and the `ApiConfig` type

## 2. Global error handler

- [x] 2.1 Extend `AppDeps` in `apps/api/src/app.ts` with `exposeErrorDetails: boolean` and thread it into `createApp`
- [x] 2.2 Register `app.onError((err, c) => …)` in `createApp` that: (a) returns `err.getResponse()` when `err instanceof HTTPException` (from `hono/http-exception`); (b) otherwise `console.error(err)` unconditionally; (c) responds `500` with `{ error: "Unexpected error" }`, additionally including `message` and `stack` only when `exposeErrorDetails` is true; guard `message`/`stack` access so a non-`Error` value cannot cause a secondary failure

## 3. Wire the flag through the composition root

- [x] 3.1 In `apps/api/src/server.local.ts`, read `EXPOSE_ERROR_DETAILS` from config and pass `exposeErrorDetails` into `createApp` (local opts in), keeping the entrypoint the only place that knows the environment
- [x] 3.2 Add `EXPOSE_ERROR_DETAILS` to `apps/api/.env.example` documenting it defaults off and is enabled for local dev

## 4. Tests

- [x] 4.1 Add a throwing/rejecting fake `TeeTimeReader` variant to `app.test.ts`
- [x] 4.2 Test: with `exposeErrorDetails: false`, a reader rejection yields `500` with body `{ error: <generic> }` and **no** `message`/`stack`
- [x] 4.3 Test: with `exposeErrorDetails: true`, the same rejection yields `500` whose body additionally carries `message` and `stack`
- [x] 4.4 Test: the existing `400` validation paths still return `400` (the error handler does not intercept them)
- [x] 4.5 Test: a handler throwing an `HTTPException` (e.g. `404`) keeps its intended status rather than becoming the generic `500`

## 5. Verify

- [x] 5.1 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors
- [x] 5.2 Run the API test suite and confirm the new error-path tests pass
- [x] 5.3 Manually confirm behavior locally: force an error (e.g. point the reader at an unreachable endpoint) and confirm the `500` body includes the stack with the flag on, and only the generic message with the flag off
