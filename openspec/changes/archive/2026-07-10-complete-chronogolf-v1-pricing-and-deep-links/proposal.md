## Why

The Chronogolf V1 scraper slice deliberately deferred two things that leave the pipeline emitting incorrect and low-value data today:

- **Prices are wrong, not just missing.** Greenbryre's scraped `green_fee` is **pre-tax**, but the pipeline's map stage is a pass-through that copies `dynamicPrice` straight into `pricePerPlayer`. The dashboard therefore shows prices ~11% under the real after-tax cost, violating FR-1.2 ("price per adult player, after-tax CAD").
- **Booking links are needlessly generic.** The slice recorded that "Chronogolf V1 carries no per-tee-time deep link" and emitted only the rung-3 portal fallback. That assumption is wrong — Chronogolf V1 exposes a per-slot reservation-review deep link (rung 1), confirmed against the live booking site. Users are being sent to a bare portal instead of the exact slot.

Both were always planned as later work; this change closes them for the one live platform.

## What Changes

- Introduce a `PricingEngine.enrich(ScrapedTeeTime) → TeeTime` stage that owns all price finalization, replacing the pass-through `toTeeTime` mapper in the ingestion pipeline. **BREAKING** to the pipeline's internal map-stage wiring (the injected mapper becomes the engine); no change to the persisted `TeeTime` shape.
- Add per-course pricing configuration `CoursePricingConfig { tax?, rules }`. Resolution chain is `applyTax(dynamicPrice) ?? resolveStatic() ?? null`. `applyTax` **fails loud** when a dynamic price arrives with no tax rule configured.
- **Option A scope:** implement tax normalization fully (Greenbryre: pre-tax, `taxRate` 0.11 → after-tax); `resolveStatic` is a stub returning `null`. The static-rule config shape is defined but rule *evaluation* is deferred to when a static-only course (Webtrac) lands and can exercise it.
- Build a rung-1 Chronogolf V1 reservation-review **deep link** inside the scraper, per group size, repeating `affiliation_type_ids` once per player and using the tee-time `id` already present in the parsed response — zero extra requests. This replaces the rung-3 portal fallback for Chronogolf V1.
- Add two Chronogolf V1 course-config fields: `slug` (club URL slug) and a **canonical user-facing booking host** (`bookingTld`), explicitly decoupled from the scrape `tld` (a rate-limit mirror lever that must not leak into user links).

## Capabilities

### New Capabilities

- `tee-time-pricing`: The `PricingEngine` finalization stage — per-course pricing config, tax normalization of the raw dynamic price, and the dynamic → static → null resolution chain (static resolution stubbed for now). Produces the canonical `TeeTime`.

### Modified Capabilities

- `tee-time-scraping`: The Chronogolf V1 booking URL requirement changes from "resolves to the portal fallback" to "resolves to a per-slot, per-group-size rung-1 reservation deep link"; Chronogolf V1 course config gains `slug` and a canonical `bookingTld` distinct from the scrape `tld`.
- `tee-time-orchestration`: The ingestion pipeline's finalization stage changes from a pass-through map to the injected `PricingEngine.enrich`; the pass-through mapper is removed.

## Impact

- `packages/scraper-core/src/domain`: new pricing engine + pricing-config types; `tee-time.mapper.ts` (pass-through) removed; `ingestion-pipeline.ts` wiring updated.
- `packages/scraper-core/src/platforms/chronogolf-v1`: scraper adapter builds the deep link; `chronogolf-v1-course-config.ts` gains `slug` + `bookingTld`; `courses/greenbryre.ts` gains those values and a pricing config.
- Course wiring in the scraper apps (`scraper-local`, `scraper-lambda`) that constructs the pipeline must inject the `PricingEngine` in place of the mapper.
- No change to the persisted `TeeTime` schema, the repository, or the API/frontend contract — they continue to read `pricePerPlayer` and `bookingUrls` verbatim.
