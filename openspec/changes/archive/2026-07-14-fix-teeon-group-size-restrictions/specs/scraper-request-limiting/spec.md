## MODIFIED Requirements

### Requirement: Captured-JSON navigate-and-capture transport

The system SHALL provide a `CapturedJsonFetcher` port whose `capture(pageUrl, targets)` navigates a page once and resolves the parsed JSON bodies of one or more responses captured from that single navigation, and a browser-backed `PlaywrightCapturedJsonFetcher` adapter implementing it. `targets` SHALL be a label-keyed map of URL prefixes, and the resolved value SHALL be a map under the same labels, each holding the parsed JSON body of the first network response whose URL matches that label's prefix. The adapter SHALL register its response waiters for every target before navigating, so responses the page's scripts issue on load are not missed. This transport exists for session-gated APIs whose key is injected by the page's own scripts, where the JSON is unreachable by a direct request, and for pages whose single load yields several responses of interest. On a non-OK captured response for any target the adapter SHALL throw the shared structured `TransportError` carrying the HTTP `status` and, when present, the parsed `Retry-After` seconds, so the same limiter retry/backoff machinery applies uniformly across transports.

#### Scenario: Multiple captured response bodies are returned keyed by label

- **WHEN** `capture(pageUrl, targets)` navigates a page whose scripts issue a matching request per target, each returning OK JSON
- **THEN** it resolves a map under the same labels as `targets`, each holding the parsed JSON body of that target's captured response

#### Scenario: A single target is captured and returned under its label

- **WHEN** `capture(pageUrl, targets)` is called with one label whose prefix matches an OK JSON response
- **THEN** it resolves a map with that one label holding the parsed JSON body

#### Scenario: Non-OK captured response yields a structured transport error

- **WHEN** any target's captured matching response is non-OK with a `Retry-After` header
- **THEN** it throws a `TransportError` exposing the numeric `status` and the parsed `retryAfterSeconds`

#### Scenario: Captured transport is limitable by the same limiter

- **WHEN** a `PlaywrightCapturedJsonFetcher` is wrapped by the host-limited captured-JSON decorator and scheduled through a limiter
- **THEN** its navigations are throttled per host under that limiter with no transport-specific limiter code
- **AND** the scheduling host is derived from `pageUrl` regardless of how many targets are captured
