## Why

The scraper writes tee times into DynamoDB, but nothing reads them back out — the dashboard has no data source. Persistence today is write-only by design (its spec deliberately named the port `Writer` to leave room for a read side). This change introduces that read side and the HTTP API that serves it, runnable entirely on a local machine so the read path can be exercised end-to-end before any AWS work.

## What Changes

- Add a read side to persistence: a transport-agnostic `TeeTimeReader` port and a `DynamoDbTeeTimeReader` adapter that returns a date's tee times via a single `Query` on the date partition. A missing table resolves to an empty list rather than an error.
- Introduce a new `tee-time-api` capability: a Hono HTTP app exposing `GET /tee-times?date=YYYY-MM-DD`. `date` is **required**; a missing or malformed date is a `400`. The response is an envelope `{ date, teeTimes, lastUpdatedAt }`, where `date` echoes the requested date and `lastUpdatedAt` is the maximum `scrapedAt` across the returned set (`null` when empty) to feed the dashboard's freshness indicator.
- The API applies no filtering and computes no "current date": it answers strictly for the requested date. Filtering and "today" are the frontend's responsibility.
- Wire the app through a `createApp(deps)` factory and a thin `server.local.ts` composition root served by `@hono/node-server`, reading from the same local DynamoDB the scraper writes to. The factory/entrypoint split leaves a seam for a future AWS Lambda handler with no restructuring.
- Enable CORS for local cross-port development and Hono's `logger()` middleware for HTTP access logs.

## Capabilities

### New Capabilities

- `tee-time-api`: The read-only HTTP API for tee times — the `GET /tee-times` endpoint, its required-date contract, the `{ teeTimes, lastUpdatedAt }` response envelope, and the locally runnable server that serves it.

### Modified Capabilities

- `tee-time-persistence`: Adds the anticipated read side — a `TeeTimeReader` port and its DynamoDB adapter with per-date read semantics and missing-table-as-empty behavior. No change to the existing write-side requirements.

## Impact

- **New app**: `apps/api` (currently an empty stub) gains `config.ts`, `app.ts`, `server.local.ts`, and tests. New dependencies: `hono`, `@hono/node-server`.
- **Modified package**: `@stt/tee-time-persistence` gains the reader adapter and a new export; `@stt/tee-time-domain` gains the `TeeTimeReader` port and export.
- **Reuses**: the existing `createDynamoDbClient` factory, `TeeTime` schema, and local DynamoDB (docker) the scraper already populates.
- **Not in scope**: AWS Lambda handler/deployment, server-side filtering, "current date" defaulting, and the frontend consumer.
