# tee-time-api Specification

## Purpose
TBD - created by archiving change add-local-tee-time-api. Update Purpose after archive.
## Requirements
### Requirement: Read tee times for a required date

The API SHALL expose `GET /tee-times` accepting a single `date` query parameter that identifies the local calendar date, formatted `YYYY-MM-DD`. The `date` parameter SHALL be required and SHALL be validated as a real calendar date. The endpoint SHALL respond with the tee times persisted for that date and SHALL NOT apply any further filtering (course, holes, group size, start time) — such filtering is the frontend's responsibility.

#### Scenario: Returns the date's tee times

- **WHEN** a client requests `GET /tee-times?date=2026-07-15` and tee times exist for that date
- **THEN** the response status is `200`
- **AND** the body contains every persisted tee time for `2026-07-15` with no filtering applied

#### Scenario: Empty result for a date with no tee times

- **WHEN** a client requests `GET /tee-times?date=2026-07-15` and no tee times are persisted for that date
- **THEN** the response status is `200`
- **AND** the body's tee time set is empty

### Requirement: Reject missing or malformed date

The API SHALL respond with `400 Bad Request` when the `date` parameter is absent or is not a valid `YYYY-MM-DD` calendar date. The API SHALL NOT substitute a default date. The error response SHALL identify the invalid parameter.

#### Scenario: Missing date parameter

- **WHEN** a client requests `GET /tee-times` with no `date` parameter
- **THEN** the response status is `400`
- **AND** the body describes that `date` is required

#### Scenario: Malformed date value

- **WHEN** a client requests `GET /tee-times?date=2026-13-40`
- **THEN** the response status is `400`
- **AND** the body describes that `date` is invalid

### Requirement: Response envelope with freshness timestamp

A successful response SHALL be a JSON envelope containing the queried `date`, the tee time set, and a `lastUpdatedAt` field. The `date` field SHALL echo the requested `YYYY-MM-DD` date so the client can correlate the response without re-parsing its request. `lastUpdatedAt` SHALL be the maximum `scrapedAt` across the returned tee times, so the dashboard can surface data freshness. When the returned set is empty, `lastUpdatedAt` SHALL be `null`.

#### Scenario: Envelope echoes the queried date

- **WHEN** a client requests `GET /tee-times?date=2026-07-15`
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
- **THEN** `GET /tee-times?date=<date>` is served over HTTP and returns persisted tee times for that date

#### Scenario: Cross-origin request from local frontend

- **WHEN** a browser on a different local origin issues `GET /tee-times`
- **THEN** the response carries the CORS headers permitting that origin

