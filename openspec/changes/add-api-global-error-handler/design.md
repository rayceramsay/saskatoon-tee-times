## Context

`apps/api` is a Hono app built by a pure factory, `createApp({ reader }: AppDeps): Hono` (`app.ts`), and wired by a thin composition root (`server.local.ts`) that loads Zod-validated config and injects a `DynamoDbTeeTimeReader`. Today the only error handling is an explicit `400 { error }` return on Zod validation failure. Any other failure — most realistically the reader rejecting — is unhandled by the app and falls through to Hono's built-in error behavior, which the app does not control.

There is no production entrypoint yet; only `server.local.ts` exists. Whatever this change introduces must therefore be shaped so the eventual Lambda composition root reuses it without restructuring — the same reason the app was split into a factory plus entrypoint in the first place. The project follows hexagonal architecture with dependency injection and an explicit-configuration principle: no reaching for `process.env` inside application code, no magic defaults.

## Goals / Non-Goals

**Goals:**

- One global net that turns any uncaught/rejected error in the request lifecycle into a consistent generic `500` envelope.
- Full error (message + stack) always logged server-side, in every environment.
- Error detail in the response body gated by an explicit, injected flag that defaults to off (fail closed).
- Intentional `HTTPException`s pass through with their intended status.
- Keep `createApp` pure and testable; keep environment knowledge in the composition root and config.

**Non-Goals:**

- Structured or domain-level logging; the pass-through read path uses `console.error`, matching the app's current logging posture (`hono/logger` for access logs).
- Error monitoring, alerting, or CloudWatch wiring (that is deployment-change territory).
- Introducing any route that actually throws an `HTTPException` — passthrough is built for the future affordance, not exercised today.
- Changing the existing `GET /tee-times` request/response contract or the `400` validation path.

## Decisions

### The seam: `app.onError`, not per-route try/catch

Hono's `app.onError((err, c) => …)` is the single hook that catches sync throws, rejected promises from `async` handlers, and throws in downstream middleware. Registering one `onError` in `createApp` covers the whole app — including the reader rejection, the realistic failure mode — with no per-route boilerplate. The existing `400` path is an explicit `return c.json(..., 400)`, not a throw, so it never reaches `onError` and is unaffected. Alternative considered: wrapping each handler in try/catch — rejected as boilerplate that drifts as routes are added and duplicates what `onError` already centralizes.

### Environment awareness by injection, not `process.env`

`AppDeps` gains an `exposeErrorDetails: boolean` flag; `onError` reads only that flag. `createApp` never touches `process.env`. This matches the codebase's DI/hexagonal posture and its "explicit configuration over magic defaults" principle, and makes the behavior trivially testable — a test passes `exposeErrorDetails: true`/`false` directly, no env stubbing. Alternatives rejected: reading `NODE_ENV` inside the handler (hidden dependency, hard to test, violates explicit-config); two separate app builders for prod/local (duplication that drifts).

### The flag is sourced from config and defaults to off

`config.ts` gains one Zod key resolving `exposeErrorDetails`, following the established `UPPERCASE_SNAKE_CASE` + inline-default + `safeParse`/`prettifyError` pattern. `server.local.ts` reads it and passes it into `createApp`. The default is **off** (details withheld), so a runtime that forgets to configure it fails closed — it can never leak a stack by omission; exposure requires an explicit opt-in. `server.local.ts` explicitly opts in so local development sees full detail. Two viable spellings for the env key:

- `EXPOSE_ERROR_DETAILS` (boolean, default `false`) — names the behavior directly; the flag maps 1:1 to the deps field.
- A broader `NODE_ENV`/environment-mode enum from which `exposeErrorDetails` is derived — more general but pulls in a concept the app does not otherwise need yet.

Leaning `EXPOSE_ERROR_DETAILS` for its directness and minimal surface; deferring a general environment-mode concept until something else needs it. (Boolean-from-env parsing follows whatever coercion the config layer already uses.)

### Logging is unconditional; only the response body is gated

`onError` calls `console.error(err)` for every unexpected error, regardless of `exposeErrorDetails`. The flag gates only what goes into the HTTP response body. This is the crux of the "still see the error in prod" requirement: production keeps the full stack in CloudWatch via `console.error`, while the wire stays generic. Separating the two channels (log vs. response) prevents a prod `500` from being undebuggable. `console.error` (not the domain `Logger` port) matches the app's existing logging altitude for this pass-through path.

### HTTPException passthrough

`onError` first checks `err instanceof HTTPException` (from `hono/http-exception`); if so it returns `err.getResponse()`, honoring the intended status. Everything else is treated as unexpected → generic `500`. This preserves the idiomatic Hono way to express a deliberate status (e.g. a future `throw new HTTPException(404)`) without it being swallowed by the catch-all. No route throws one today; this is cheap future-proofing wired in now so the contract is complete.

### Response shape

Consistent with the existing `{ error: <string> }` envelope:

- Disabled (prod): `{ error: "Unexpected error" }`
- Enabled (local): `{ error: "Unexpected error", message: err.message, stack: err.stack }`

One envelope shape across all error responses; the enabled form is a superset, so clients parsing `error` behave identically in both.

```
              request
                 │
                 ▼
        cors ─▶ logger ─▶ handler ── throws / rejects ─┐
                 │ (400 path returns here, not a throw)│
                 ▼                                     ▼
             normal 2xx                        app.onError(err, c)
                                                       │
                                    ┌──────────────────┼───────────────────┐
                                    ▼                  ▼                   ▼
                        err instanceof         console.error(err)    exposeErrorDetails?
                        HTTPException?          (always, all envs)     ├ true  → { error, message, stack }
                        └ yes → err.getResponse()                      └ false → { error }
```

## Risks / Trade-offs

- **Forgetting to set the flag in a new (prod) entrypoint leaks stacks** → mitigated by defaulting off: exposure requires an explicit opt-in, so omission fails closed. `server.local.ts` is the only place that opts in.
- **`console.error` in the response path is coarse** (no correlation id, no structure) → acceptable for now; it matches the current logging altitude and the deferred observability work will revisit structured logging holistically.
- **Passthrough for a feature not yet used** could look like dead code → it is a deliberate, spec-backed part of the error contract and is covered by a test, so the behavior is pinned even before a route uses it.
- **A thrown non-`Error` value** (e.g. a rejected non-Error) → Hono routes non-Error throws differently; the handler treats anything reaching it that is not an `HTTPException` as unexpected and returns the generic `500`, guarding `message`/`stack` access so a non-Error cannot itself cause a second failure.

## Migration Plan

Additive and behavior-preserving for all existing paths: `200` and `400` responses are unchanged; only the previously-uncontrolled error fall-through is now an explicit `500`. No schema, no new package, no dependency beyond what `hono` already provides (`hono/http-exception`). Reverting is deleting the `onError` block, the config key, and the deps field. Local run is unchanged; the developer now sees full error detail in `500` responses.

## Open Questions

- Env key spelling: `EXPOSE_ERROR_DETAILS` boolean (leaning this) vs. deriving from a broader environment-mode enum — settle at implementation, not contract-significant.
- Exact generic message wording (`"Unexpected error"` vs. `"Internal Server Error"`) — cosmetic; the spec only requires it be generic and non-disclosing.
