## Context

`packages/scraper-core` has one working platform slice: the Chronogolf V1 scraper produces `ScrapedTeeTime[]` for `(course, date)`. Nothing executes it — `apps/scraper-local`, `scraper-lambda`, and `api` are empty; `web` is a scaffold. The full orchestration + pricing + persistence layer is designed but unbuilt.

This change builds the smallest end-to-end skeleton: drive the existing Greenbryre scraper over its booking window and land the results in a local DynamoDB you can query. It is deliberately narrow — one course, no pricing, no rate limiting — so that every unproven seam (booking-window fan-out, failure isolation, the persisted type, DynamoDB round-trip) is exercised once before breadth (more platforms) or depth (pricing, live API) is added.

Constraints: OOP + hexagonal (ports/adapters, dependencies pointing inward), explicit-over-implicit configuration, test behaviours not implementation. The persisted store is contractually allowed to be up to ~15 minutes stale (FR-4.2).

## Goals / Non-Goals

**Goals:**

- Run the full `cron → orchestrate → persist` path against `amazon/dynamodb-local`, verifiable by scanning the table.
- Introduce the canonical `TeeTime` (public) type and the `ScrapedTeeTime → TeeTime` seam, wired as a pass-through so pricing slots in later without a persistence refactor.
- Fan out `(course, date)` units with `Promise.all` and per-unit failure isolation (FR-1.5).
- Snapshot-replace a unit's tee times into a keyed store; evict past dates via TTL (FR-1.4).
- Add booking-window config + `bookableDates` so scrapes respect each course's window (FR-1.3).

**Non-Goals:**

- `HostRateLimiter` and HTTP 429/503 backoff (FR-1.6) — deferred; one course on one origin at local volume will not trip limits.
- `PricingEngine` / static pricing rules / tax normalization (FR-1.7) — deferred; `TeeTime` is a pass-through for now.
- Transactional/atomic writes — deferred (see Decision 4).
- The API and dashboard, and any deployed AWS infrastructure — local docker only.
- Additional platforms/courses (Webtrac, Chronogolf V2, TeeOn, Dakota Dunes) — this slice is Greenbryre only.

## Decisions

### 1. The pipeline is orchestrate → persist, with a pass-through `TeeTime`

Two stages — the full pipeline's pricing stage (orchestrate → price → persist) is skipped here. `TeeTime` is introduced now (not deferred to the pricing change) as a pass-through: `pricePerPlayer = dynamicPrice`, no tax, no static rules. This keeps the seam's *shape* intact — the repository already speaks the public `TeeTime` type, so adding the real `PricingEngine` later is purely additive (replace the pass-through mapper) and touches neither the repository nor the persisted schema.

Alternative considered: persist `ScrapedTeeTime` directly and introduce `TeeTime` only when pricing lands. Rejected — it would force a later refactor of the repository's type and the table's item shape exactly when we're trying to add pricing cleanly.

`IngestionPipeline.run(now)` composes the stages so entrypoints never wire them ad hoc (guards against "someone forgets a stage").

### 2. Booking-window logic is domain, computed in the course's time zone

`CourseConfig` gains `maxAdvanceDays` and `releaseTime`; `bookableDates(config, now)` expands them into local `YYYY-MM-DD` dates. All reasoning happens in the course's `timeZone` (`America/Regina` today, but never assumed — future courses may differ). The furthest-out date is withheld until local time reaches `releaseTime`. This is platform-agnostic domain logic, not scraper mechanics — it lives in `scraper-core/domain`, and the orchestrator calls it to build work units.

### 3. Orchestrator fans out everything; politeness is deferred, not designed away

The orchestrator builds `(scraper, courseId, date)` units and runs them under `Promise.all`, isolating each with a wrapper that turns a rejection into "no records + surfaced failure." It holds no throttle knob — concurrency is decoupled from rate: the orchestrator fans out aggressively, and politeness is meant to live in a single per-host choke point (a future `HostRateLimiter` inside the `HttpClient`), never in the orchestrator. Because rate limiting is deferred, there is simply no choke point yet; the seam where a `HostRateLimiter` will later sit (inside the `HttpClient`) is left untouched, so adding it changes no orchestrator code.

### 4. Persistence = snapshot-replace per `(course, date)`, non-transactional and self-healing

A scrape of a unit is an *authoritative complete snapshot*, so persistence is set-replacement, not upsert: query the unit's current keys, delete those absent from the new set, put the new set (paged `BatchWriteItem` in chunks of 25).

**Not transactional, by decision.** The trap: `TransactWriteItems` caps at 100 items, but a single busy `(course, date)` unit can be 100–300 items (many time slots × hole/routing listings), and two transactions are not jointly atomic — so naive transactions silently stop being atomic under load. The only truly-atomic option at arbitrary size is a versioned-snapshot + pointer-swap, which adds read-side version filtering and stale-version GC.

We take neither. Snapshot-replace is self-healing — every run re-derives the full truth, so a crashed or partially-applied write is a bounded error corrected by the next tick (~15 min), which is inside the product's stated staleness budget (FR-4.2). And in this slice there is no concurrent reader at all (API deferred), so a partial write is unobservable. Atomicity here would be insurance against an audience of zero.

Escape hatch (documented, not built): if atomic reads ever become required, move to versioned-snapshot + single-`UpdateItem` pointer swap.

### 5. Table keying: `PK = date`, `SK = courseId#startInstant#holes#routing`

Folding `courseId` into the sort-key *prefix* under a `date` partition serves both access patterns without a GSI:

- **Future per-date read (F2):** `Query(PK=date)` returns every course's times for the day.
- **Per-unit write:** `Query(PK=date, SK begins_with "courseId#")` returns just the unit's items to diff for reconciliation.

Routing is in the sort key because it is a real identity discriminator: a 9-hole front and a 9-hole back at the same start time are distinct tee times, not one overwriting the other. Empty routing encodes to a stable sentinel. A numeric TTL attribute = `epoch(startInstant)` evicts past dates whose partitions are no longer scraped (FR-1.4) without an explicit sweep.

Trade-off: one hot partition per date (all courses' times for a day). At this scale — low thousands of items per date, one "today" partition hot for reads — this is well within DynamoDB limits.

### 6. Local DynamoDB via `amazon/dynamodb-local` in docker-compose

The official image (lighter than LocalStack when only DynamoDB is needed). Bootstrap creates the table (with TTL enabled) against the local endpoint; the AWS SDK v3 DynamoDB client is pointed at the local endpoint via explicit configuration (endpoint + dummy credentials), never implicit defaults. The `scraper-local` entrypoint runs an in-process cron (per CLAUDE.md) invoking `IngestionPipeline.run(now)`.

## Risks / Trade-offs

- **Non-atomic writes leave a transient partial state** → Mitigated: bounded to one tick by self-healing reconcile, unobservable in this slice (no reader), within the ~15-min staleness contract. Escape hatch documented (Decision 4).
- **`BatchWriteItem` returns `UnprocessedItems` under throttling** → Must retry unprocessed items within the write; local volume makes throttling unlikely, but the adapter should still handle the return value rather than assume full success.
- **Hot per-date partition** → Acceptable at Saskatoon scale (a handful of courses × a booking window). Revisit only if item counts or read volume grow far beyond v1.
- **Time-zone / release-time edge cases** (DST, midnight, exactly-at-release) → `America/Regina` observes no DST, reducing risk today, but `bookableDates` must be unit-tested at the `releaseTime` boundary and across the day rollover since future courses may sit in DST zones.
- **Greenbryre's real `maxAdvanceDays`/`releaseTime` values** are config facts that must be sourced from the PRD addendum / the booking site, not guessed.

## Open Questions

- Confirm Greenbryre's actual booking window (`maxAdvanceDays`, `releaseTime`) from the PRD addendum before hardcoding.
- Cron cadence for local runs — mirror prod's 15 min, or a shorter local interval for faster feedback while developing?
