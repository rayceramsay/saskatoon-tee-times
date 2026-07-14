## ADDED Requirements

### Requirement: Generic 500 for unexpected errors

The API SHALL catch any uncaught error or rejected promise raised while handling a request — whether thrown by a route handler or by downstream middleware — and SHALL respond with `500 Internal Server Error`. The response SHALL be a JSON envelope of the same shape as the API's other error responses, `{ error: <string> }`, whose `error` value is a generic message (e.g. `"Unexpected error"`) that does not disclose the underlying cause. This handling SHALL NOT alter the existing `400` validation path, which returns before any error is thrown.

#### Scenario: Handler rejection becomes a generic 500

- **WHEN** a request is handled and the tee time reader rejects (or a handler otherwise throws)
- **THEN** the response status is `500`
- **AND** the body is a JSON envelope `{ error: <generic message> }` that does not include the underlying error's message or stack

#### Scenario: Validation errors are unaffected

- **WHEN** a client requests `GET /tee-times` with a missing or malformed `date`
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
