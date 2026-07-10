## MODIFIED Requirements

### Requirement: Structured transport error carrying backoff signal

The browser JSON fetcher SHALL surface a typed error carrying at least the HTTP `status` and, when present, the response's `Retry-After` value in seconds, instead of throwing an opaque string. The status code and `Retry-After` header SHALL be read from the browser navigation response so the backoff information is preserved.

#### Scenario: Failed response yields a typed error with status and retry-after

- **WHEN** navigating to the JSON endpoint yields a non-OK response that includes a `Retry-After` header
- **THEN** the fetcher rejects with a typed error exposing the numeric `status` and the parsed `retryAfterSeconds`

#### Scenario: Failed response without retry-after still carries status

- **WHEN** navigating to the JSON endpoint yields a non-OK response with no `Retry-After` header
- **THEN** the fetcher rejects with a typed error exposing the numeric `status` and an absent `retryAfterSeconds`
