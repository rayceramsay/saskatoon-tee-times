## Context

`scraper-core` is hexagonal: a scraper depends on a fetcher **port**, not a concrete transport, and each platform lives in `platforms/<name>/` as an adapter plus per-course config files with `__fixtures__/`. Two transports exist today: `JsonFetcher` (browser-backed `PlaywrightJsonFetcher`, wrapped by `HostLimitedJsonFetcher`) and `TextFetcher` (plain-`fetch` `HttpTextFetcher`, wrapped by `HostLimitedTextFetcher`). Both share one generic `RequestLimiter` (bottleneck) and one `TransportError`. Pricing is centralized in `PricingEngine.enrich` (`dynamic → static → null`) and requires a `CoursePricingConfig` entry per `courseId` (it throws otherwise).

The Legends Golf Club (Warman) books through TeeOn. A live investigation of the guest portal established the constraints this design responds to:

- **The guest availability JSON is session-gated.** `GET admin.teeon.com/api/2024-04/guest/tee-time?facility_id=477&date=…&extended=true&turn_tee_time=true` returns the availability array, but only to a client the portal SPA has primed — the API key is injected by the page's JavaScript. A direct request (plain `fetch`, or a browser navigating straight to the JSON URL) returns `401 {"error":"API Key not provided."}`, and an in-page `fetch()` from page context returns `{error}` for the same reason. The only reliable path is to navigate the portal page and **capture** the SPA's own `guest/tee-time` XHR response. No existing fetcher does navigate-and-capture.
- **The guest payload carries no price.** Its only price-ish fields are `booking_fee` (null) and `dynamic_percent_variation`. Green fees live in a separate `guest/tee-sheet/check-in` variant sheet, and the per-slot variant resolution is unsolved (see Non-Goals / the deferred follow-up).
- **Payload shape (captured, confirmed):** each row is one start on `division_title` (e.g. `"Front"`), with `start_time`, `date`, `quantity_remaining`, `blocked_type` (`"open"` when bookable), and — when an 18-hole round is bookable — `turn_tee_time` plus `turn_division_title` (e.g. `"Back"`). `facility.timezone` is `America/Regina`.

The reference implementations to mirror are `platforms/chronogolf-v1/` (JSON, Zod-validated, fan-out) for the adapter shape and the webtrac change for how a new transport is added to the limiter surface.

## Goals / Non-Goals

**Goals:**

- Add a TeeOn platform scraper producing canonical `ScrapedTeeTime` records, mirroring the chronogolf-v1 structure, with all courses as configuration.
- Introduce a captured-JSON transport (`CapturedJsonFetcher` port + `PlaywrightCapturedJsonFetcher` + `HostLimitedCapturedJsonFetcher`) that reuses the existing `RequestLimiter` and `TransportError` unchanged.
- Keep the scraper price-free: it emits `dynamicPrice: null`; The Legends ships with an empty `CoursePricingConfig` so `enrich` yields `pricePerPlayer: null`.

**Non-Goals:**

- **TeeOn dynamic pricing.** The `guest/tee-sheet/check-in` variant sheet is reachable, but mapping a slot to its variant (time-tier rules, `dynamic_percent_variation`, taxability) is unsolved and gets its own follow-up change. This change ships availability only.
- Generalizing the three transports into one fetcher port — the captured transport has a genuinely different call signature (`capture(pageUrl, matcher)` vs `fetch(url)`), so it is added alongside, consistent with the JSON/Text split.
- Lambda/production wiring (`apps/scraper-lambda` is still a stub) — only `apps/scraper-local` wiring is in scope.
- Any change to the `ScrapedTeeTime`/`TeeTime` schema — TeeOn fits the existing shape unchanged.

## Decisions

### D1: A `CapturedJsonFetcher` port distinct from `JsonFetcher`

TeeOn needs navigate-a-page-and-capture-a-response, whose natural surface is `capture(pageUrl, responseUrlPrefix): Promise<unknown>` — two inputs, not the one URL that `JsonFetcher.fetchJson(url)` takes. Rather than overload `JsonFetcher` (whose contract is "fetch this exact resource") or thread an optional matcher through it, add a sibling port. **Why over reusing `PlaywrightJsonFetcher`:** its every fetch does `page.goto(url)` to the resource itself; TeeOn's resource 401s on direct navigation. The two share the browser mechanics but not the contract, so a separate adapter is honest. The duplication is one small class and one small decorator — the same trade accepted for `TextFetcher` in the webtrac change.

### D2: `PlaywrightCapturedJsonFetcher` — own browser lifecycle, capture by URL prefix

The adapter launches/shares a headless chromium browser + context lazily and exposes `close()`, exactly like `PlaywrightJsonFetcher`. `capture(pageUrl, responseUrlPrefix)` registers `page.waitForResponse(r => r.url().startsWith(responseUrlPrefix))` **before** `page.goto(pageUrl)`, then reads the matched response: on non-OK it throws `TransportError(status, parseRetryAfter(...))`; on OK it returns the parsed JSON body. Matching by URL **prefix** (facility + date, minus the volatile trailing params) was validated against the live portal. The `parseRetryAfter` helper mirrors the JSON adapter's.

### D3: TeeOn shares the Playwright limiter instance (global page ceiling), independent per-host

TeeOn's captured-JSON transport drives Playwright, so it shares the **same** `BottleneckRequestLimiter` instance as the chronogolf browser transport rather than getting its own. The `globalMaxConcurrent` ceiling models the number of browser pages open at once — a Playwright compute/politeness budget that must be enforced across *all* browser-driven scrapers, not per platform; two independent instances would each open up to the ceiling and blow the real page budget. Per-host caps stay independent for free: bottleneck keys per-host budgets by hostname within one instance, and `admin.teeon.com` ≠ chronogolf's host, so the two platforms never share a per-host budget. **Why over a dedicated instance (webtrac's model):** webtrac uses plain `fetch` (no browser pages), so its ceiling is a genuinely separate budget; TeeOn's ceiling is the same physical resource — browser pages — as chronogolf's, so it must be the same instance.

### D4: Adapter maps each open start to 9- and 18-hole records

Parsing is pure and Zod-validated against fixtures (chronogolf convention). For each row: drop unless `blocked_type === 'open'` and `quantity_remaining >= 1`. Emit a 9-hole record (`routing: [division_title]`) always; emit an 18-hole record (`routing: [division_title, turn_division_title]`) only when `turn_tee_time` is present **and** `turn_division_title` is non-null (late-day starts lack the back-nine continuation). `groupSizes = [1 .. min(quantity_remaining, 4)]` (contiguous — unlike chronogolf's per-size probing, TeeOn states remaining capacity directly). `startInstant` via the shared `buildLocalStartInstant(date, start_time, timeZone)`. Every record: `onlineBookable: true`, `dynamicPrice: null`.

**Empirical basis for the "always 9-hole" rule:** two open starts can be byte-for-byte identical in the availability payload (same `division_title`, `turn_tee_time`, `divisions_available`, `blocked_type`) yet the portal's default view shows only an 18-hole *price* for one and both a 9- and 18-hole price for the other. That difference is purely a pricing-display artifact (which time-windowed variants carry a price), **not** an availability signal: filtering the portal to "9 holes only" still lists the 18-hole-priced slot with a working Select button, confirming 9 holes is bookable at every open start regardless of whether a 9-hole price is configured. The availability payload therefore carries no 9-vs-18 bookability signal beyond `turn_tee_time` (which gates 18), so the adapter always emits the 9-hole record; per-slot price and any twilight-only nuance belong to the deferred pricing change.

### D5: Booking URL is the portal-with-date, shared across sizes

TeeOn exposes no per-slot/per-size deep link without an authenticated session, so the best available link is the course `portalUrl` with `?date=<record date>`. Every valid group size maps to that same URL. This is the same link driven for the capture, and matches the spike's approach.

### D6: The Legends ships with an empty pricing config

`enrich` throws on a missing `courseId` entry, so The Legends still needs a `CoursePricingConfig` in the pricing map — but `{ rules: [] }`, yielding `pricePerPlayer: null` for every record (the scraper's `dynamicPrice: null` has nothing to fall back to). This is the honest "price unknown" state until the pricing follow-up lands; upgrading later is a config change plus (for dynamic) the deferred resolver.

### D7: `the-legends` course id, config-only future courses

`courseId` is `'the-legends'`, display name `"The Legends"` (the spike used `'warman'`; the primitives doc example already uses `'the-legends'`). `'teeon'` is already a member of the closed `PlatformId` enum, so no domain change. The `TeeOnCourseConfig` (adds `facilityId`, `portalUrl`) and a `courses/the-legends.ts` exporting a course config + an (empty) pricing config mirror the webtrac/chronogolf layout, so a second TeeOn course is purely a new config file plus a `package.json` export and a line in the composition root.

## Risks / Trade-offs

- **TeeOn changes its guest API shape or session mechanism** → Capture stops matching or the payload drifts. Mitigation: Zod validation fails loud; parser tests are pinned to committed fixtures; capture matches a stable URL prefix (facility + date).
- **Headless capture is heavier and slower than a direct fetch** → A full SPA load per date, per course. Mitigation: shared browser/context across calls; the shared browser limiter's global page ceiling bounds total Playwright fan-out across chronogolf + TeeOn; this matches the already-accepted chronogolf browser cost. Interacts with the known full-window fan-out concurrency concern (bound belongs in the host limiter).
- **`waitForResponse` could hang if the SPA never issues the request** (bot detection, markup change) → Mitigation: rely on Playwright's default navigation/response timeout surfacing as an error the orchestrator logs per course, rather than a silent stall; a missing capture fails that course's scrape loudly.
- **Availability shown without a price** → The dashboard renders TeeOn slots with `pricePerPlayer: null`. Accepted and intentional for this slice; the pricing follow-up closes it. No misleading price is ever shown.
- **Duplicated host-limited decorator** (third one) → Minor, consistent with the JSON/Text split; a later refactor can unify if the transports converge.

## Migration Plan

1. Capture and commit TeeOn guest `tee-time` fixtures (a future date with 9- and 18-hole starts; a late-day/no-`turn_tee_time` case) under `platforms/teeon/__fixtures__/`.
2. Land the captured-JSON transport (port + Playwright adapter + host-limited decorator + `package.json` exports) — internal, no effect on chronogolf/webtrac.
3. Add the TeeOn platform (adapter + course-config type) and `courses/the-legends.ts` (course config + empty pricing config); add exports.
4. Wire `apps/scraper-local`: construct the captured-JSON stack sharing the browser transport's limiter instance, add `TeeOnScraper` to the orchestrator, add The Legends' empty pricing config to the `PricingEngine` map.
5. Run against local DynamoDB and confirm The Legends records land for a future date (9- and 18-hole, `onlineBookable: true`, `pricePerPlayer: null`).

Rollback is dropping the TeeOn scraper and captured-JSON stack from the composition root; the transport and config additions are inert without wiring and touch no existing platform.

## Open Questions

- None blocking. The one deferred unknown — TeeOn slot→variant price resolution — is intentionally scoped out to the pricing follow-up change.
