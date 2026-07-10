# scraper-request-limiting

## Purpose

Bounding and pacing the scraper's outbound requests so a full scrape stays within each host's tolerance and the machine's browser-page compute budget. This capability establishes a request limiter port (backed by `bottleneck`), per-host concurrency caps, a global browser-page ceiling, structured transport errors carrying backoff signals, `Retry-After`-aware retry and per-host circuit pausing, a host-limited `JsonFetcher` decorator, and explicit limiter configuration.

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

### Requirement: Global browser-page ceiling

The browser transport's limiter SHALL enforce a single global ceiling on the number of jobs running concurrently across all hosts, representing the machine's browser-page compute limit. A job SHALL start only when both a slot for its host and a global slot are free, and holding a global slot SHALL NOT block on a busy host (no head-of-line blocking). The ceiling SHALL be sourced from explicit configuration, not a hard-coded constant.

#### Scenario: Total concurrency never exceeds the ceiling

- **WHEN** jobs across several hosts are scheduled such that the sum of per-host caps exceeds the global ceiling
- **THEN** the number of jobs running at once never exceeds the global ceiling
- **AND** additional runnable jobs wait for a global slot even when their host has a free slot

#### Scenario: A job waiting on a busy host does not consume a global slot

- **WHEN** one host is at its per-host cap and a job for a different, free host is runnable
- **THEN** the job for the free host is not starved by jobs queued behind the busy host

### Requirement: Structured transport error carrying backoff signal

The browser JSON fetcher SHALL surface a typed error carrying at least the HTTP `status` and, when present, the response's `Retry-After` value in seconds, instead of throwing an opaque string. The status code and `Retry-After` header SHALL be read from the in-page response before the error crosses the page boundary so the backoff information is preserved.

#### Scenario: Failed response yields a typed error with status and retry-after

- **WHEN** the in-page fetch receives a non-OK response that includes a `Retry-After` header
- **THEN** the fetcher rejects with a typed error exposing the numeric `status` and the parsed `retryAfterSeconds`

#### Scenario: Failed response without retry-after still carries status

- **WHEN** the in-page fetch receives a non-OK response with no `Retry-After` header
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

The system SHALL provide a `JsonFetcher` decorator that derives the hostname from the request URL and runs the delegated fetch through the limiter's `schedule` operation. The decorator SHALL implement the same `JsonFetcher` port as the transport it wraps, so it is substitutable wherever a `JsonFetcher` is expected and keeps limiting independent of transport mechanics.

#### Scenario: Fetch is scheduled under the URL's host

- **WHEN** the decorator's `fetchJson(url)` is called
- **THEN** it schedules the inner fetch under the hostname parsed from `url`
- **AND** returns the inner fetcher's result unchanged on success

#### Scenario: Decorator is substitutable for the wrapped fetcher

- **WHEN** the decorator is used in place of a plain `JsonFetcher`
- **THEN** scrapers call it through the unchanged `fetchJson(url)` contract with no scraper changes

### Requirement: Explicit limiter configuration

Limiter behavior SHALL be driven by explicit configuration: a per-host default cap plus optional per-host overrides keyed by hostname, a global browser-page ceiling from an environment variable, and retry thresholds (maximum attempts and `maxRetryAfterSeconds`). Configuration SHALL be keyed by hostname and a single default — never per course or per platform. The browser-page ceiling SHALL fail loud when unset rather than defaulting silently. Hosts without an override SHALL inherit the default cap.

#### Scenario: Host without override inherits the default

- **WHEN** a job runs for a host that has no configured override
- **THEN** the per-host default cap applies to it

#### Scenario: Overridden host uses its override

- **WHEN** a job runs for a host listed in the overrides
- **THEN** that host's overridden cap applies instead of the default

#### Scenario: Missing page ceiling fails loud

- **WHEN** the browser-page ceiling environment variable is not set
- **THEN** configuration loading fails with an error rather than proceeding with an implicit default
