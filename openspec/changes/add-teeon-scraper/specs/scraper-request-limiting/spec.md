## MODIFIED Requirements

### Requirement: Host-limited fetcher decorator

The system SHALL provide a host-limited decorator for each fetcher port — the `JsonFetcher`, the `TextFetcher`, and the `CapturedJsonFetcher` — that derives the hostname from the request URL and runs the delegated fetch through the limiter's `schedule` operation. Each decorator SHALL implement the same fetcher port it wraps, so it is substitutable wherever that port is expected and keeps limiting independent of transport mechanics. For the captured-JSON transport the scheduling host SHALL be derived from the page URL that is navigated.

#### Scenario: Fetch is scheduled under the URL's host

- **WHEN** a host-limited decorator's fetch (`fetchJson(url)`, `fetchText(url)`, or `capture(pageUrl, ...)`) is called
- **THEN** it schedules the inner fetch under the hostname parsed from the request/page URL
- **AND** returns the inner fetcher's result unchanged on success

#### Scenario: Decorator is substitutable for the wrapped fetcher

- **WHEN** a host-limited decorator is used in place of its plain fetcher
- **THEN** scrapers call it through the unchanged fetcher-port contract with no scraper changes

## ADDED Requirements

### Requirement: Captured-JSON navigate-and-capture transport

The system SHALL provide a `CapturedJsonFetcher` port whose `capture(pageUrl, responseUrlPrefix)` navigates a page and resolves with the parsed JSON body of the first network response whose URL matches `responseUrlPrefix`, and a browser-backed `PlaywrightCapturedJsonFetcher` adapter implementing it. This transport exists for session-gated APIs whose key is injected by the page's own scripts, where the JSON is unreachable by a direct request. On a non-OK captured response the adapter SHALL throw the shared structured `TransportError` carrying the HTTP `status` and, when present, the parsed `Retry-After` seconds, so the same limiter retry/backoff machinery applies uniformly across transports.

#### Scenario: Captured response body is returned as JSON

- **WHEN** `capture(pageUrl, responseUrlPrefix)` navigates a page whose scripts issue a matching request that returns OK JSON
- **THEN** it resolves with the parsed JSON body of that captured response

#### Scenario: Non-OK captured response yields a structured transport error

- **WHEN** the captured matching response is non-OK with a `Retry-After` header
- **THEN** it throws a `TransportError` exposing the numeric `status` and the parsed `retryAfterSeconds`

#### Scenario: Captured transport is limitable by the same limiter

- **WHEN** a `PlaywrightCapturedJsonFetcher` is wrapped by the host-limited captured-JSON decorator and scheduled through a limiter
- **THEN** its navigations are throttled per host under that limiter with no transport-specific limiter code
