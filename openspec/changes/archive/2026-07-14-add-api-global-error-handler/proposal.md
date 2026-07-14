## Why

The API has no defense against unexpected errors. If `reader.readTeeTimesForDate` rejects — or any handler throws — the response falls through to Hono's built-in behavior, which the app does not control: the body shape, status, and how much of the error surfaces are all implicit. There is no guarantee an internal error stays generic on the wire, and no consistent envelope for callers. The read path is a public-facing endpoint destined for a Lambda behind CloudFront, so a leaked stack trace or error message is a real information-disclosure concern in production, while locally the opposite is true — a developer wants the full error and stack immediately, in the response.

## What Changes

- Add a global `app.onError` handler to the Hono app that catches any uncaught error or rejected promise from a handler or downstream middleware and returns a consistent `500` JSON envelope `{ error: "Unexpected error" }`, matching the existing `{ error: <string> }` shape used by the `400` path.
- Always log the full error (message + stack) via `console.error`, in every environment, so production still captures the stack in CloudWatch — only the **response body** is gated by environment, never the logging.
- Gate error detail in the response body on an injected, explicit flag: when enabled (local), the `500` body additionally carries `message` and `stack`; when disabled (prod, the default), the body stays generic. The flag is injected into `createApp`, sourced from a new Zod-validated config key, and **defaults to off** so a forgotten flag fails closed and never leaks.
- Pass through intentional `HTTPException`s: if a handler deliberately throws an `HTTPException` (a future affordance for expressing a specific status like `404`), the handler honors its intended status/response rather than masking it as a generic `500`. Only genuinely unexpected errors become the generic `500`.

## Capabilities

### Modified Capabilities

- `tee-time-api`: Adds an unexpected-error contract to the HTTP API — the generic `500` envelope for uncaught errors, unconditional server-side logging of the full error, environment-gated exposure of error detail in the response (off by default), and `HTTPException` passthrough for intentional statuses. No change to the existing `GET /tee-times` request/response requirements.

## Impact

- **Modified app**: `apps/api` — `app.ts` gains the `onError` handler and `AppDeps` gains an `exposeErrorDetails` flag; `config.ts` gains one new env key resolving that flag (default off); `server.local.ts` passes the flag through from config; `app.test.ts` gains error-path tests.
- **Reuses**: the existing `createApp(deps)` DI seam and Zod config pattern — no restructuring. The factory/entrypoint split means a future Lambda composition root sets the flag to off the same way.
- **Not in scope**: structured/domain logging (still `console.error` on the pass-through path), error monitoring/alerting, per-route error handling, and throwing `HTTPException`s anywhere today — passthrough is built in but no route uses it yet.
