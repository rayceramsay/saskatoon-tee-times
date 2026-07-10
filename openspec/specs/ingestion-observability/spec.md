# ingestion-observability

## Purpose

Making an ingestion run observable through leveled logging and structured lifecycle events. This capability defines the `Logger` port with an opt-in `debug` level, explicit and fail-loud log-level configuration, and the run-scoped events an ingestion run emits — an `info`-level lifecycle and summary always visible, with detailed intra-run stage progress reserved for `debug`.

## Requirements

### Requirement: Leveled logger with an opt-in debug level

The `Logger` port SHALL expose four severity levels — `debug`, `info`, `warn`, and `error` — each accepting a message and optional structured context. `debug` SHALL be reserved for developer-facing detail and SHALL be opt-in: a logger implementation SHALL be configured with a minimum level and SHALL suppress any event below that level. The default minimum level SHALL be `info`, so `debug` events are suppressed unless explicitly enabled. `info`, `warn`, and `error` events SHALL always be emitted at the default level.

#### Scenario: Debug suppressed at the default level

- **WHEN** a logger is configured with the default minimum level and a `debug` event is emitted
- **THEN** the event is not written to the sink
- **AND** an `info`, `warn`, or `error` event emitted at the same time is written

#### Scenario: Debug emitted when the minimum level is lowered

- **WHEN** a logger is configured with a minimum level of `debug` and a `debug` event is emitted
- **THEN** the event is written to the sink

### Requirement: Log level is explicitly configured and fails loudly

The runtime's minimum log level SHALL be read from explicit configuration (a `LOG_LEVEL` value) rather than an implicit default in code, and SHALL default to `info` when unset. The value SHALL be validated against the known level names; an unrecognized value SHALL fail configuration loading loudly rather than being silently coerced or ignored.

#### Scenario: Unset log level defaults to info

- **WHEN** configuration is loaded with no `LOG_LEVEL` provided
- **THEN** the minimum level resolves to `info`

#### Scenario: Invalid log level fails loudly

- **WHEN** configuration is loaded with a `LOG_LEVEL` that is not one of the known level names
- **THEN** configuration loading fails with an error rather than starting the runtime

### Requirement: Ingestion run emits lifecycle and summary events

An ingestion run SHALL emit an `info`-level run-started event when it begins and an `info`-level run-finished summary when it completes. The run-started event SHALL report the number of scrape units queued. The run-finished summary SHALL report the run's wall-clock duration, the count of units that succeeded versus failed, the number of tee times persisted, and the number of `(course, date)` groups written. These `info`-level events SHALL be emitted regardless of whether `debug` is enabled.

#### Scenario: Run start and summary are visible at info level

- **WHEN** a run executes to completion with the default (`info`) minimum level
- **THEN** an event is emitted at the start reporting the number of queued units
- **AND** an event is emitted at the end reporting duration, units succeeded and failed, tee times persisted, and groups written

#### Scenario: Summary distinguishes partial failure

- **WHEN** a run completes in which some scrape units failed and others succeeded
- **THEN** the run-finished summary reports the failed-unit count as nonzero and still reports the totals contributed by the successful units

### Requirement: Detailed stage progress is emitted at debug level

An ingestion run SHALL emit `debug`-level detail for intra-run progress: each scrape unit's completion (including its record count and duration), the start of the persist stage, each `(course, date)` group written, and the persist stage's completion. This detail SHALL be suppressed at the default minimum level and SHALL appear only when `debug` is enabled. Per-unit failures SHALL continue to be surfaced at `error` level independent of the minimum level.

#### Scenario: Per-unit and persist detail appear only under debug

- **WHEN** a run executes with the minimum level set to `debug`
- **THEN** each successful unit's completion, the persist-stage start and finish, and each group write are emitted
- **AND** with the default (`info`) minimum level none of that detail is emitted

#### Scenario: Unit failures are surfaced regardless of level

- **WHEN** a scrape unit fails during a run at the default (`info`) minimum level
- **THEN** the failure is emitted at `error` level with the failing unit's identifying context
