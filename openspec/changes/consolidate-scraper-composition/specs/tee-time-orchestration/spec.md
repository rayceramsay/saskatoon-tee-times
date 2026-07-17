# tee-time-orchestration

## ADDED Requirements

### Requirement: Scraper composition is a shared factory across runtimes

The system SHALL compose the ingestion pipeline in a single injectable factory that every scraper runtime calls, rather than in a per-runtime entrypoint. The factory SHALL own the wiring that is identical across runtimes: the request limiters, the transports and their host-limited decorators, every platform scraper and the course configurations registered to it, the orchestrator, and the pricing engine. It SHALL return an `IngestionPipeline` ready to run.

The scraper SHALL be a single package with one entrypoint per runtime. Deployment target SHALL be a build-time choice — which entrypoint is bundled — and SHALL NOT be a package boundary, because what drives a change to scraper composition (adding a course) changes every runtime identically. Runtime-only concerns (scheduling, local store bootstrap) SHALL live in the entrypoint that needs them, so that a bundler tracing imports from another entrypoint never reaches them.

The course registry SHALL be structured so that registering a course is a single edit: the platform scraper's configurations and the pricing engine's `courseId`-keyed map SHALL both derive from one registration, never from two lists maintained in parallel.

#### Scenario: Every runtime composes through the same factory

- **WHEN** a scraper runtime needs an ingestion pipeline
- **THEN** it obtains it from the shared factory rather than wiring the stages itself
- **AND** no runtime holds a second copy of the composition

#### Scenario: Adding a course is a single edit

- **WHEN** a new course is registered in the composition factory
- **THEN** it is scraped by its platform's scraper and priced by the pricing engine
- **AND** no second registration is required for either to see it

#### Scenario: Runtime-only concerns stay out of the shared factory

- **WHEN** an entrypoint requires scheduling or local store bootstrap
- **THEN** that concern lives in the entrypoint, not the factory
- **AND** an entrypoint that does not need it does not reach it through the factory

### Requirement: The composition factory allocates nothing that must be closed

The composition factory SHALL NOT construct, acquire, or own any resource requiring release — no database client, no browser session, no process, no socket. Every closeable resource SHALL be created by the runtime-specific entrypoint, injected into the factory as an already-live collaborator, and released by that same entrypoint. Non-closeable collaborators built on top of a closeable resource (such as a writer over a database client) SHALL likewise be constructed by the entrypoint and injected, so that the factory never holds the handle whose lifetime it does not control.

This SHALL apply regardless of how many resources a runtime holds, and SHALL be the mechanism by which browser lifetime — the one genuine difference between a long-running scraper runtime and a serverless one — is expressed. A long-running runtime MAY keep an injected browser session warm across scheduled runs; a serverless runtime SHALL close its session before the invocation returns. Neither choice SHALL require a change to the factory.

#### Scenario: Factory receives live collaborators, not handles to build them from

- **WHEN** the composition factory is called
- **THEN** it receives an already-constructed writer, browser session, and logger
- **AND** it receives no database client or table name from which it would construct a writer itself

#### Scenario: The entrypoint owns every teardown

- **WHEN** a scraper runtime shuts down or an invocation completes
- **THEN** the entrypoint releases every resource it created
- **AND** the pipeline returned by the factory exposes no teardown of its own

#### Scenario: Browser lifetime differs per runtime without changing the factory

- **WHEN** a long-running runtime keeps one injected browser session across many scheduled runs, and a serverless runtime closes its session before returning
- **THEN** both call the same factory with the same signature
- **AND** neither runtime's lifetime policy is encoded in the composition
