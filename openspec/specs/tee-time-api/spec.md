# tee-time-api Specification

## Purpose
TBD - created by archiving change add-local-tee-time-api. Update Purpose after archive.
## Requirements
### Requirement: Read tee times for a required date

The API SHALL expose `GET /api/tee-times` accepting a single `date` query parameter that identifies the local calendar date, formatted `YYYY-MM-DD`. The `date` parameter SHALL be required and SHALL be validated as a real calendar date. The endpoint SHALL respond with the tee times persisted for that date and SHALL NOT apply any further filtering (course, holes, group size, start time) — such filtering is the frontend's responsibility.

#### Scenario: Returns the date's tee times

- **WHEN** a client requests `GET /api/tee-times?date=2026-07-15` and tee times exist for that date
- **THEN** the response status is `200`
- **AND** the body contains every persisted tee time for `2026-07-15` with no filtering applied

#### Scenario: Empty result for a date with no tee times

- **WHEN** a client requests `GET /api/tee-times?date=2026-07-15` and no tee times are persisted for that date
- **THEN** the response status is `200`
- **AND** the body's tee time set is empty

### Requirement: Reject missing or malformed date

The API SHALL respond with `400 Bad Request` when the `date` parameter is absent or is not a valid `YYYY-MM-DD` calendar date. The API SHALL NOT substitute a default date. The error response SHALL identify the invalid parameter.

#### Scenario: Missing date parameter

- **WHEN** a client requests `GET /api/tee-times` with no `date` parameter
- **THEN** the response status is `400`
- **AND** the body describes that `date` is required

#### Scenario: Malformed date value

- **WHEN** a client requests `GET /api/tee-times?date=2026-13-40`
- **THEN** the response status is `400`
- **AND** the body describes that `date` is invalid

### Requirement: Response envelope with freshness timestamp

A successful response SHALL be a JSON envelope containing the queried `date`, the tee time set, and a `lastUpdatedAt` field. The `date` field SHALL echo the requested `YYYY-MM-DD` date so the client can correlate the response without re-parsing its request. `lastUpdatedAt` SHALL be the maximum `scrapedAt` across the returned tee times, so the dashboard can surface data freshness. When the returned set is empty, `lastUpdatedAt` SHALL be `null`.

#### Scenario: Envelope echoes the queried date

- **WHEN** a client requests `GET /api/tee-times?date=2026-07-15`
- **THEN** the response envelope's `date` field is `2026-07-15`

#### Scenario: Freshness reflects the newest scrape

- **WHEN** a date's tee times were scraped at differing `scrapedAt` instants
- **THEN** the response `lastUpdatedAt` equals the greatest `scrapedAt` among them

#### Scenario: Null freshness for empty result

- **WHEN** the requested date has no tee times
- **THEN** the response `lastUpdatedAt` is `null`

### Requirement: Locally runnable HTTP server

The API SHALL be runnable on a local machine, served over HTTP against the local DynamoDB the scraper writes to, without any AWS dependency. The Hono application SHALL be constructed by a factory that receives its dependencies (the tee time reader) by injection, and a separate local entrypoint SHALL wire those dependencies and start the HTTP server. The application SHALL enable cross-origin requests for local development so a frontend served from a different port can call it.

#### Scenario: Local server serves the endpoint

- **WHEN** the local entrypoint is started against a reachable local DynamoDB
- **THEN** `GET /api/tee-times?date=<date>` is served over HTTP and returns persisted tee times for that date

#### Scenario: Cross-origin request from local frontend

- **WHEN** a browser on a different local origin issues `GET /api/tee-times`
- **THEN** the response carries the CORS headers permitting that origin

### Requirement: Generic 500 for unexpected errors

The API SHALL catch any uncaught error or rejected promise raised while handling a request — whether thrown by a route handler or by downstream middleware — and SHALL respond with `500 Internal Server Error`. The response SHALL be a JSON envelope of the same shape as the API's other error responses, `{ error: <string> }`, whose `error` value is a generic message (e.g. `"Unexpected error"`) that does not disclose the underlying cause. This handling SHALL NOT alter the existing `400` validation path, which returns before any error is thrown.

#### Scenario: Handler rejection becomes a generic 500

- **WHEN** a request is handled and the tee time reader rejects (or a handler otherwise throws)
- **THEN** the response status is `500`
- **AND** the body is a JSON envelope `{ error: <generic message> }` that does not include the underlying error's message or stack

#### Scenario: Validation errors are unaffected

- **WHEN** a client requests `GET /api/tee-times` with a missing or malformed `date`
- **THEN** the response status is `400` as before
- **AND** the unexpected-error handler does not run

### Requirement: Unexpected errors are always logged server-side

When the API handles an unexpected error, it SHALL log the full error, including its message and stack, to the server's error output regardless of environment. Server-side logging SHALL NOT be gated by any environment or exposure setting, so production retains the full error for diagnosis even though the response body stays generic.

#### Scenario: Full error logged in every environment

- **WHEN** an unexpected error is handled, with response error detail disabled (as in production)
- **THEN** the full error, including its stack, is written to the server's error log
- **AND** the response body still contains only the generic message

### Requirement: Environment-gated error detail in the response

The API SHALL expose the underlying error's detail in the `500` response body only when explicitly configured to do so. The exposure SHALL be controlled by a configuration flag injected into the application, and that flag SHALL default to disabled, so that error detail is never exposed unless a runtime explicitly opts in. When exposure is enabled, the `500` body SHALL additionally include the error's `message` and full `stack`. When exposure is disabled, the `500` body SHALL contain only the generic `error` message and SHALL NOT include the message or stack.

#### Scenario: Detail exposed when enabled (local)

- **WHEN** the application is configured with error detail exposure enabled and an unexpected error is handled
- **THEN** the response status is `500`
- **AND** the body includes the error's `message` and full `stack` alongside the generic `error` message

#### Scenario: Detail withheld when disabled (production default)

- **WHEN** the application is configured with error detail exposure disabled and an unexpected error is handled
- **THEN** the response status is `500`
- **AND** the body contains only the generic `error` message, with no `message` or `stack` field

#### Scenario: Exposure defaults to disabled

- **WHEN** the exposure flag is not explicitly configured
- **THEN** the application behaves as if exposure is disabled and withholds error detail from the response

### Requirement: Intentional HTTPExceptions are honored

When a handler deliberately throws an `HTTPException` to signal a specific HTTP status, the API SHALL respond with that exception's intended status and response rather than converting it into the generic `500`. Only errors that are not `HTTPException`s SHALL be treated as unexpected and mapped to the generic `500`.

#### Scenario: HTTPException keeps its intended status

- **WHEN** a handler throws an `HTTPException` carrying a specific status (for example `404`)
- **THEN** the response uses that exception's status and response
- **AND** the response is not replaced by the generic `500` envelope

