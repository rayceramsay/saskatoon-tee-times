# scraper-request-limiting

## Purpose

Bounding and pacing the scraper's outbound requests so a full scrape stays within each host's tolerance and each limiter instance's compute/politeness budget. This capability establishes a request limiter port (backed by `bottleneck`), per-host concurrency caps, a transport-neutral global concurrency ceiling, structured transport errors carrying backoff signals, `Retry-After`-aware retry and per-host circuit pausing, host-limited `JsonFetcher` and `TextFetcher` decorators, a plain-HTTP text transport, and explicit limiter configuration.

## Requirements

### Requirement: Request limiter port

The system SHALL expose a request limiter behind a small port whose surface is a single `schedule(host, fn)`-style operation that runs `fn` under the host's limits and resolves with its result (or rejects with its error). The concrete limiter SHALL be the only place the `bottleneck` library is referenced; `bottleneck` types and API SHALL NOT leak past the limiter adapter. The limiter SHALL live in the transport layer alongside the fetchers.

#### Scenario: Scheduled work runs and its result is returned

- **WHEN** a caller invokes `schedule(host, fn)` for a host with free capacity
- **THEN** `fn` is executed
- **AND** the returned promise resolves with `fn`'s result, or rejects with `fn`'s error if it throws

#### Scenario: Library is encapsulated behind the port

- **WHEN** a consumer depends on the limiter
- **THEN** it depends only on the port's `schedule` surface
- **AND** no `bottleneck` type appears in the consumer's code

### Requirement: Per-host concurrency cap

The limiter SHALL bound the number of concurrently running jobs per hostname to a configured cap. Jobs are keyed by hostname so that two jobs targeting the same host share one budget while jobs targeting different hosts run under independent budgets. When a host is at its cap, further jobs for that host SHALL queue until an in-flight job for that host completes.

#### Scenario: Same host shares one budget

- **WHEN** more jobs than the per-host cap are scheduled for a single host
- **THEN** no more than the cap run concurrently for that host
- **AND** the excess jobs run only as in-flight jobs for that host complete

#### Scenario: Different hosts have independent budgets

- **WHEN** jobs are scheduled for two different hosts, each up to its cap
- **THEN** both hosts run their jobs concurrently without one host's load reducing the other's available slots

### Requirement: Global concurrency ceiling

A limiter instance SHALL enforce a single global ceiling on the number of jobs running concurrently across all hosts, representing that instance's compute/politeness budget independent of transport. A job SHALL start only when both a slot for its host and a global slot are free, and holding a global slot SHALL NOT block on a busy host (no head-of-line blocking). The ceiling SHALL be sourced from explicit configuration (`globalMaxConcurrent`), not a hard-coded constant, and SHALL be transport-neutral — it applies equally to a browser transport and a plain-HTTP text transport.

#### Scenario: Total concurrency never exceeds the ceiling

- **WHEN** jobs across several hosts are scheduled such that the sum of per-host caps exceeds the global ceiling
- **THEN** the number of jobs running at once never exceeds the global ceiling
- **AND** additional runnable jobs wait for a global slot even when their host has a free slot

#### Scenario: A job waiting on a busy host does not consume a global slot

- **WHEN** one host is at its per-host cap and a job for a different, free host is runnable
- **THEN** the job for the free host is not starved by jobs queued behind the busy host

### Requirement: Structured transport error carrying backoff signal

The browser JSON fetcher SHALL surface a typed error carrying at least the HTTP `status` and, when present, the response's `Retry-After` value in seconds, instead of throwing an opaque string. The status code and `Retry-After` header SHALL be read from the browser navigation response so the backoff information is preserved.

#### Scenario: Failed response yields a typed error with status and retry-after

- **WHEN** navigating to the JSON endpoint yields a non-OK response that includes a `Retry-After` header
- **THEN** the fetcher rejects with a typed error exposing the numeric `status` and the parsed `retryAfterSeconds`

#### Scenario: Failed response without retry-after still carries status

- **WHEN** navigating to the JSON endpoint yields a non-OK response with no `Retry-After` header
- **THEN** the fetcher rejects with a typed error exposing the numeric `status` and an absent `retryAfterSeconds`

### Requirement: Retry-After honored for the failing job within a threshold

On a retryable failure (429 or 503), the limiter SHALL re-queue and retry the failing job after waiting the server-provided `Retry-After` (or a computed backoff when absent), up to a configured maximum number of attempts. When the required wait exceeds the configured `maxRetryAfterSeconds` threshold, the limiter SHALL give up on the job immediately rather than waiting, and SHALL NOT pause the host — letting the next scheduled run recover it. Non-retryable errors SHALL propagate unchanged to the caller (the orchestrator's per-unit isolation).

#### Scenario: Short retry-after triggers a retry

- **WHEN** a job fails with 429 carrying a `Retry-After` at or under the threshold and attempts remain
- **THEN** the job is retried after approximately that wait

#### Scenario: Over-threshold retry-after gives up without pausing

- **WHEN** a job fails with a `Retry-After` exceeding `maxRetryAfterSeconds`
- **THEN** the job is not retried, the host is not paused, and the error surfaces so the run continues

#### Scenario: Exhausted attempts give up

- **WHEN** a retryable job has already been retried the maximum number of times
- **THEN** it is not retried again and its failure surfaces

#### Scenario: Non-retryable error is not retried

- **WHEN** a job fails with an error that is neither 429 nor 503
- **THEN** the limiter does not retry it and the error propagates to the caller

### Requirement: Per-host circuit pause on backoff

On a retryable failure within the threshold, in addition to retrying the failing job, the limiter SHALL pause the offending host so no new job for that host starts until a resume time, while other hosts continue unaffected. In-flight jobs for the paused host MAY finish. Concurrent backoff signals for the same host SHALL be deduplicated so the pause window is extended to the latest resume time rather than stacked, and the host SHALL resume automatically at that time.

#### Scenario: A 429 pauses only the offending host

- **WHEN** a job for host A fails with a within-threshold 429 while host B has queued jobs
- **THEN** no new job for host A starts until host A's resume time
- **AND** host B's jobs keep running throughout

#### Scenario: Host resumes after the pause window

- **WHEN** a paused host reaches its resume time
- **THEN** new jobs for that host (including the retried job) start again

#### Scenario: Concurrent pauses extend rather than stack

- **WHEN** two in-flight jobs for the same host each trigger a pause at overlapping times
- **THEN** the host is paused once until the latest resume time, not paused twice in sequence

### Requirement: Host-limited fetcher decorator

The system SHALL provide a host-limited decorator for each fetcher port — the `JsonFetcher`, the `TextFetcher`, and the `CapturedJsonFetcher` — that derives the hostname from the request URL and runs the delegated fetch through the limiter's `schedule` operation. Each decorator SHALL implement the same fetcher port it wraps, so it is substitutable wherever that port is expected and keeps limiting independent of transport mechanics. For the captured-JSON transport the scheduling host SHALL be derived from the page URL that is navigated.

#### Scenario: Fetch is scheduled under the URL's host

- **WHEN** a host-limited decorator's fetch (`fetchJson(url)`, `fetchText(url)`, or `capture(pageUrl, ...)`) is called
- **THEN** it schedules the inner fetch under the hostname parsed from the request/page URL
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
