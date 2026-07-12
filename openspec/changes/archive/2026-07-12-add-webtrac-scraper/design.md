## Context

The scraper-core architecture (hexagonal, OOP, dependency-injected) was built with two seams deliberately left open for exactly this course family:

1. **Transport is a port.** Scrapers depend on a fetcher interface, not a concrete transport. Today the only port is `JsonFetcher` (browser-backed `PlaywrightJsonFetcher`, wrapped by `HostLimitedJsonFetcher`). WebTrac serves HTML over plain `fetch`, which no existing port covers.
2. **Pricing is centralized and half-built.** `PricingEngine.enrich` resolves `pricePerPlayer` as `dynamic → static → null`, but `resolveStatic` is a stub returning `null`. The `PricingRule`/`CoursePricingConfig` shapes were designed up front for the static case but never exercised — no static-only course existed yet.

WebTrac (`leisure.saskatoon.ca`) backs Saskatoon's four municipal courses. Its green fees are a static, city-published annual rate card (weekday/weekend by hole count), so there is no per-slot scraped price. A fresh live pull confirmed the current HTML structure matches the prior spike and surfaced one product-shaping fact: WebTrac only opens **online** booking 7 days ahead **excluding the current day**, so on any given day every same-day slot is genuinely available but not online-bookable. This is a high-volume state, not an edge case.

The reference implementation to mirror is `platforms/chronogolf-v1/` (adapter + course-config + `courses/*.ts` each exporting a course config and a pricing config, with `__fixtures__/`).

## Goals / Non-Goals

**Goals:**

- Add a WebTrac platform scraper producing canonical `ScrapedTeeTime` records, mirroring the chronogolf-v1 structure.
- Introduce a plain-HTTP text transport (`TextFetcher` port + `HttpTextFetcher` + `HostLimitedTextFetcher`) that reuses the existing generic `RequestLimiter` and `TransportError` unchanged.
- Make `resolveStatic` real (first-match rule evaluation) and drive the four WebTrac courses' pricing from it.
- Model availability vs. online-bookability explicitly via a new `onlineBookable` field that flows scrape → price → persist → serve.
- Keep the scraper price-free: it emits `dynamicPrice: null`; the pricing engine owns all money.

**Non-Goals:**

- Frontend rendering of the phone-only state (a follow-up concern in `apps/web`) beyond ensuring the field is present and served. No phone number is added to `CourseConfig` yet.
- Lambda/production wiring (`apps/scraper-lambda` is still a stub) — only `apps/scraper-local` wiring is in scope.
- Any change to the browser/JSON transport behavior beyond the ceiling rename.
- Automatic rate-card updates: the annual green fees stay hand-maintained config.

## Decisions

### D1: Parallel `TextFetcher` port rather than a generalized fetch port

A new `TextFetcher { fetchText(url): Promise<string> }` mirrors `JsonFetcher` exactly, with its own `HostLimitedTextFetcher` decorator (~10 lines). **Why over generalizing** to one `Fetcher<T>` / response-returning port: the generic route churns the working chronogolf JSON stack and reconciles method-name differences for no functional gain. The generic piece that actually matters — `RequestLimiter.schedule<T>` — is already transport-agnostic and is reused as-is. The cost is one small duplicated decorator, which is honest and matches the project's "explicit over clever" stance. `HttpTextFetcher` throws the same `TransportError` on non-OK as `PlaywrightJsonFetcher`, so retry/backoff is uniform.

### D2: WebTrac gets its own limiter instance

WebTrac hits a single host and does no rate limiting, but a full run fans out to ~4 courses × up-to-2 hole counts × ~8 dates against that one host. A dedicated `BottleneckRequestLimiter` instance bounds that fan-out for politeness and to protect our own runtime; its retry/pause axis simply never fires (no 429/503). Sharing the browser transport's limiter would be wrong: that instance's global ceiling models browser-page compute, which is meaningless for plain `fetch`.

### D3: Rename `browserPageCeiling` → `globalMaxConcurrent`

The field was only ever a global `maxConcurrent` on the parent bottleneck; "browser page" was incidental to Playwright being the sole transport. With a second, page-less transport reusing `RequestLimiterConfig`, the name actively misleads. Rename the config field, the adapter references, the "Axis B — global browser-page ceiling" comment, and the `apps/scraper-local` env var to a transport-neutral name. Pairs naturally with the existing per-host `maxConcurrent`.

### D4: Explicit `onlineBookable` on the base tee-time schema (not implicit empty `bookingUrls`)

Add `onlineBookable: boolean` to `BaseTeeTime` so it lives on both `ScrapedTeeTime` and canonical `TeeTime` and passes through `enrich` unchanged. **Why explicit over "empty `bookingUrls` means phone-only"**: the empty-map convention is ambiguous (empty-because-phone-only vs empty-because-bug) and violates the project's fail-loud / explicit-configuration principle. A boolean is the minimal honest signal the frontend branches on to render "call to book" instead of a dead button. Chosen boolean over a `'online' | 'phone'` enum because there are exactly two states today; an enum can replace it later without touching the resolution logic. Existing chronogolf records set `onlineBookable: true` (they always have a deep link).

### D5: `resolveStatic` as pure first-match over `PricingRule`

Implement the stub as: return the after-tax `price` of the first rule whose predicates all match, else `null`. Predicates: `holes` equality (required) plus optional `daysOfWeek`, `after`/`before` (`[after, before)`), and `dates`. Local date / `HH:mm` / day-of-week are sliced from `startInstant` (which carries the course's offset) — `slice(0,10)`, `slice(11,16)`, and `new Date(localDate + 'T00:00:00Z').getUTCDay()` — so no time-zone library is needed. First-match keeps rule authoring predictable; WebTrac needs only `holes` + `daysOfWeek`, but implementing the full predicate set now exercises the shape the interface already promised.

### D6: WebTrac parsing details (from the live pull)

- **Request**: `search.html` with `Action=Start`, `SubAction=`, `secondarycode`, `begindate=MM/DD/YYYY`, `begintime=12:00 am`, `numberofholes`, `numberofplayers=1`, `display=Detail`, `module=GR`, `multiselectlist_value=`, `grwebsearch_buttonsearch=yes`.
- **Rows**: `table#grwebsearch_output_table tbody tr`; header lives in `<thead>` so `tbody tr` is safe. Cart `<a>` is the *first* cell (`data-title=""`); labelled cells addressed by `data-title` = `Course`/`Date`/`Time`/`Open Slots`/`Holes`.
- **Normalization**: `Date` `MM/DD/YYYY` → `YYYY-MM-DD`; `Time` cell has a leading space → trim; `Holes` `"18 (Front)"` → count + start set; course cell label is ignored in favor of the requested course config.
- **Classification**: success cart button + real href → `onlineBookable: true`; error button whose `data-tooltip` contains `"Individual Allowance Rules"` with `openSlots > 0` → `onlineBookable: false`, empty `bookingUrls`, kept; otherwise dropped.
- **Routing**: `9 → [startSet]`; `18 (Front) → ["Front","Back"]`, `18 (Back) → ["Back","Front"]`; no set → `[]`.
- **Group sizes**: `[1 .. min(openSlots, 4)]`.
- **Booking URLs**: absolute add-to-cart href, per size set `GlobalSalesArea_GRNumSlots=<size>`.

### D7: Fixtures pulled first

The first implementation task pulls and commits real WebTrac HTML fixtures (one per course/hole-count, including at least one same-day phone-only page) under `platforms/webtrac/__fixtures__/`, mirroring the chronogolf fixture convention. The parser and its tests are written against these, so markup drift shows up as a failing test rather than silent data loss.

## Risks / Trade-offs

- **Stale annual rate card** → Green fees are hand-maintained from the city's PDF; a wrong number silently misprices. Mitigation: keep the numbers in per-course config with a comment flagging annual re-verification, and treat them as data, not code.
- **`onlineBookable` is a breaking schema addition** → Persisted/served records and the web app must all carry it. Mitigation: add it to the base schema in one change so scrape/price/persist/API stay coherent; snapshot-replace persistence means old records are overwritten on the next run rather than migrated.
- **HTML drift on `leisure.saskatoon.ca`** → A markup change breaks parsing. Mitigation: fixture-pinned parser tests; a shape mismatch fails validation loudly (consistent with chronogolf's fixture approach).
- **"Individual Allowance Rules" semantics could vary** → The tooltip is assumed to mean "available, phone-only." The live pull confirmed it for same-day across all rows; if other restriction phrasings appear they currently fall into the drop bucket, which is safe (hidden, not mis-shown). Mitigation: capture a phone-only fixture and assert on it; revisit if new tooltip variants surface.
- **Duplicated host-limited decorator** (D1) → Minor. Accepted as the cost of not disturbing the working JSON stack; a later refactor can unify if a third transport appears.

## Migration Plan

1. Pull + commit WebTrac HTML fixtures.
2. Land the transport rename (`globalMaxConcurrent`) and text-fetch stack — internal, no behavior change to chronogolf.
3. Add `onlineBookable` to the schema; set existing chronogolf records to `true`.
4. Implement `resolveStatic`; add WebTrac platform + course/pricing configs.
5. Wire `apps/scraper-local`; run against local DynamoDB and verify both online-bookable and phone-only records land, priced correctly.

Rollback is dropping the WebTrac scraper and text stack from the composition root; the `onlineBookable` field and `resolveStatic` implementation are backward-compatible with chronogolf and can stay.

## Open Questions

- Frontend "call to book" affordance wording and whether it eventually warrants a phone number on `CourseConfig` (deferred by decision until it recurs).
- Whether any WebTrac course exposes an 18-hole routing other than Front/Back (only `(Front)` seen in the pull) — the parser handles the general case but only Front/Back are asserted by fixtures so far.
