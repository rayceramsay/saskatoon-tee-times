## RENAMED Requirements

- FROM: `### Requirement: Global browser-page ceiling`
- TO: `### Requirement: Global concurrency ceiling`

## MODIFIED Requirements

### Requirement: Global concurrency ceiling

A limiter instance SHALL enforce a single global ceiling on the number of jobs running concurrently across all hosts, representing that instance's compute/politeness budget independent of transport. A job SHALL start only when both a slot for its host and a global slot are free, and holding a global slot SHALL NOT block on a busy host (no head-of-line blocking). The ceiling SHALL be sourced from explicit configuration (`globalMaxConcurrent`), not a hard-coded constant, and SHALL be transport-neutral — it applies equally to a browser transport and a plain-HTTP text transport.

#### Scenario: Total concurrency never exceeds the ceiling

- **WHEN** jobs across several hosts are scheduled such that the sum of per-host caps exceeds the global ceiling
- **THEN** the number of jobs running at once never exceeds the global ceiling
- **AND** additional runnable jobs wait for a global slot even when their host has a free slot

#### Scenario: A job waiting on a busy host does not consume a global slot

- **WHEN** one host is at its per-host cap and a job for a different, free host is runnable
- **THEN** the job for the free host is not starved by jobs queued behind the busy host

### Requirement: Host-limited fetcher decorator

The system SHALL provide a host-limited decorator for each fetcher port — the `JsonFetcher` and the `TextFetcher` — that derives the hostname from the request URL and runs the delegated fetch through the limiter's `schedule` operation. Each decorator SHALL implement the same fetcher port it wraps, so it is substitutable wherever that port is expected and keeps limiting independent of transport mechanics.

#### Scenario: Fetch is scheduled under the URL's host

- **WHEN** a host-limited decorator's fetch (`fetchJson(url)` or `fetchText(url)`) is called
- **THEN** it schedules the inner fetch under the hostname parsed from `url`
- **AND** returns the inner fetcher's result unchanged on success

#### Scenario: Decorator is substitutable for the wrapped fetcher

- **WHEN** a host-limited decorator is used in place of its plain fetcher
- **THEN** scrapers call it through the unchanged fetcher-port contract with no scraper changes

### Requirement: Explicit limiter configuration

Limiter behavior SHALL be driven by explicit configuration: a per-host default cap plus optional per-host overrides keyed by hostname, a global concurrency ceiling (`globalMaxConcurrent`) from an environment variable, and retry thresholds (maximum attempts and `maxRetryAfterSeconds`). Configuration SHALL be keyed by hostname and a single default — never per course or per platform. The global concurrency ceiling SHALL fail loud when unset rather than defaulting silently. Hosts without an override SHALL inherit the default cap.

#### Scenario: Host without override inherits the default

- **WHEN** a job runs for a host that has no configured override
- **THEN** the per-host default cap applies to it

#### Scenario: Overridden host uses its override

- **WHEN** a job runs for a host listed in the overrides
- **THEN** that host's overridden cap applies instead of the default

#### Scenario: Missing concurrency ceiling fails loud

- **WHEN** the global concurrency ceiling environment variable is not set
- **THEN** configuration loading fails with an error rather than proceeding with an implicit default

## ADDED Requirements

### Requirement: Plain-HTTP text transport

The system SHALL provide a `TextFetcher` port whose `fetchText(url)` returns the response body as a string, and a plain-HTTP `HttpTextFetcher` adapter implementing it with `fetch` (no browser). On a non-OK HTTP response the adapter SHALL throw the shared structured `TransportError` carrying the HTTP `status` and, when present, the parsed `Retry-After` seconds, so the same limiter retry/backoff machinery applies uniformly across transports. The adapter SHALL return the decoded body on success without parsing it as JSON.

#### Scenario: Successful fetch returns the body as text

- **WHEN** `fetchText(url)` receives an OK response
- **THEN** it resolves with the response body as a string, unparsed

#### Scenario: Non-OK response yields a structured transport error

- **WHEN** `fetchText(url)` receives a non-OK response with a `Retry-After` header
- **THEN** it throws a `TransportError` exposing the numeric `status` and the parsed `retryAfterSeconds`

#### Scenario: Text transport is limitable by the same limiter

- **WHEN** an `HttpTextFetcher` is wrapped by the host-limited text decorator and scheduled through a limiter
- **THEN** its requests are throttled per host under that limiter with no transport-specific limiter code
