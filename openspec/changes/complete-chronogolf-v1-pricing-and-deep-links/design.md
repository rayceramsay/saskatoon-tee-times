## Context

The Chronogolf V1 slice split the pipeline at a schema seam: `ScrapedTeeTime` (raw, `dynamicPrice`) → *enrich* → `TeeTime` (public, `pricePerPlayer`). To ship the slice thin, two pieces were stubbed:

- The **enrich** stage is a pass-through `toTeeTime` mapper (`tee-time.mapper.ts`) that copies `dynamicPrice` into `pricePerPlayer`. Greenbryre's `green_fee` is **pre-tax**, so the dashboard currently understates prices by the tax rate (~11%).
- Booking URLs emit only the **rung-3** portal fallback (`bestBookingUrl(config.bookingPortalUrl)`), on a recorded assumption that Chronogolf V1 has no per-slot deep link. That assumption is wrong — Chronogolf V1 exposes a **rung-1** reservation-review link per slot, confirmed against the live booking site.

This change closes both for the one live platform (Greenbryre), keeping the persisted `TeeTime` shape, the repository, and the API/frontend contract untouched.

## Goals / Non-Goals

**Goals:**

- Replace the pass-through mapper with a `PricingEngine.enrich` stage that tax-normalizes the dynamic price and follows the `dynamic → static → null` chain, failing loud on a missing tax rule.
- Emit a per-slot, per-group-size rung-1 deep link for Chronogolf V1, built inside the scraper with zero extra requests.
- Decouple the user-facing booking host from the scrape mirror `tld`.
- Keep the static-rule config shape ready so rule evaluation is a later fill-in, not a rewrite.

**Non-Goals:**

- Implementing static pricing **rule evaluation** (`resolveStatic` stays a `null` stub). Its real customer is a static-only Webtrac course that doesn't exist yet.
- Any change to `TeeTime`, persistence, the repository, or the API/frontend.
- Deep links or pricing for other platforms/courses.

## Decisions

### 1. `PricingEngine` replaces the injected `mapToTeeTime`, same seam

The pipeline already injects the enrich stage (`mapToTeeTime = toTeeTime`). The engine implements the identical `(ScrapedTeeTime) => TeeTime` signature, so wiring swaps one dependency and deletes `tee-time.mapper.ts`. `enrich` drops `dynamicPrice`, sets `pricePerPlayer = applyTax(dynamicPrice, cfg.tax, courseId) ?? resolveStatic(scraped, cfg.rules)`, and passes every other field through.

- *Alternative — keep the mapper, add tax inside it:* rejected. The engine is a per-course-config-parameterized unit; tax status is course config, not a hardcoded constant. A free function couldn't hold per-course config cleanly.

### 2. Pricing config is per-course data, `{ tax?, rules }`, keyed by `courseId`

`applyTax` grosses up a non-inclusive price by `taxRate` and rounds to cents, or passes through a tax-inclusive one; it **throws** when a non-null dynamic price has no `tax` rule (fail loud over silently emitting a pre-tax number). Greenbryre config: `tax: { scrapedPriceIncludesTax: false, taxRate: 0.11 }`, `rules: []`. Static-only courses omit `tax`.

- *Alternative — a single global tax rate:* rejected; tax status is per-course and per-platform-response, and Webtrac courses won't have a dynamic price at all.

### 3. `resolveStatic` is a typed stub returning `null`

The `PricingRule[]` shape is defined in config types now, but `resolveStatic` returns `null` for this change. This fixes the live tax bug immediately while deferring rule evaluation to the change that introduces a course needing it — where it can be fixture-tested against real posted pricing rather than shipped as near-dead code on Greenbryre (which is dynamic-priced, so the branch only fires when a price is genuinely absent).

- *Alternative — author Greenbryre static rules now:* rejected per Option A; unexercised rules risk being wrong-not-missing and add scope without a test surface.

### 4. Rung-1 deep link built inside the scraper, per group size

In `mergeListing`, replace the rung-3 `bestBookingUrl(config.bookingPortalUrl)` with a rung-1 builder that consumes data already in hand: the merged slot `id` (= `teetime_id`), the listing's `chronogolfCourseId` and `nbHoles`, the queried `date`, and `config.affiliationTypeId`. For each valid group size the builder repeats `affiliation_type_ids` once per player, so `bookingUrls[groupSize]` is slot-and-size specific. `bestBookingUrl` still resolves the candidate ladder (deep link first, portal fallback last) so a future builder failure degrades gracefully. Zero extra requests — the ladder resolves at parse time.

Template (hash-fragment params assembled by hand to keep `affiliation_type_ids` comma-joined, not URL-encoded):

```
https://www.chronogolf.{bookingTld}/club/{slug}/booking/?source=chronogolf&medium=profile
  #/teetime/review?date={date}&course_id={chronoCourseId}&nb_holes={holes}
  &affiliation_type_ids={affId,affId,...}&teetime_id={id}
```

### 5. `bookingTld` and `slug` are new config, `bookingTld` decoupled from scrape `tld`

The scrape `tld` is a rate-limit **mirror** lever and may be retuned freely; a user link must stay stable. So the deep-link host is its own field (`bookingTld`), plus the club `slug`. Both live on `ChronogolfV1CourseConfig`; Greenbryre gets `slug: 'greenbryre-country-club-closed-until-2013-season'` (the club's live booking-site slug) and `bookingTld: 'ca'`.

- *Alternative — reuse the scrape `tld`:* rejected; couples user-facing links to internal throttle tuning and risks sending users to an odd mirror.

## Risks / Trade-offs

- **Deep-link structure is reverse-engineered** → a Chronogolf change silently degrades a slot to the portal fallback (via the candidate ladder) rather than breaking; worth monitoring. Fixture tests pin the current shape.
- **`bookingTld`/`slug` are hand-authored per course** → wrong values yield dead links, not scrape failures. Mitigation: verify Greenbryre's live link once during implementation.
- **Static stub returns null** → any course that ever lacks a dynamic price shows no price until rule evaluation lands. Accepted: matches FR-1.7's null tail and today only Greenbryre (dynamic) exists.
- **Rounding** → gross-up rounds to two decimals; sub-cent drift is not a concern for display prices.
- **Fixtures assert pre-tax input** → the pricing fixtures must encode that Greenbryre's scraped value is pre-tax so the after-tax assertion is meaningful; a mislabeled fixture would hide a regression.

## Migration Plan

1. Land config-type additions (`slug`, `bookingTld`, `CoursePricingConfig`) and Greenbryre values.
2. Add `PricingEngine` + `applyTax`/`resolveStatic`; swap it into the pipeline; delete `tee-time.mapper.ts`.
3. Switch the scraper's booking-URL construction to the rung-1 builder.
4. Update scraper-app wiring (`scraper-local`, `scraper-lambda`) to inject the engine.
5. No data migration — snapshot-replace overwrites each `(course, date)` unit on the next run, so corrected prices/links propagate within one 15-min cycle.

Rollback: revert the wiring commit; the pass-through path is restored from git history.

## Open Questions

- Confirm the review deep link renders correctly against the `.ca` canonical host with the group-size `affiliation_type_ids` repetition (manual click-through during the live verification step). Greenbryre's `slug` is known and unchanged: `greenbryre-country-club-closed-until-2013-season`.
