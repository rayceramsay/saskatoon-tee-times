## Why

The TeeOn scraper advertises tee times as bookable at group sizes TeeOn rejects. It emits `groupSizes` as the contiguous range `[1 .. min(quantity_remaining, 4)]`, hardcoding a floor of 1. But TeeOn enforces a per-facility rule that a solo player may only *join* a partially-filled group, never start one on an empty tee time — so an empty slot's real floor is 2, not 1. A live capture confirmed this: The Legends' 2:48pm slot on 2026-07-15 shows as "2 - 4 Players" in TeeOn's own UI and rejects a 1-player booking, yet the dashboard offers it for 1.

The floor is **not** in the `guest/tee-time` feed. A full field-level diff of a restricted row against an unrestricted one shows them identical except for `id`/`position`/`start_time`/`quantity_remaining`. The rule lives in a separate response, `guest/facility/settings/tee-sheet`, whose `single_bookings`/`twosome_bookings`/`threesome_bookings`/`foursome_bookings` fields gate each size. That response is **date-independent** and — decisively — the portal SPA already fires it on the same navigation the scraper drives to capture `tee-time`. Capturing it is a second response from a page load we already perform, but the current `CapturedJsonFetcher` only captures one response per navigation.

## What Changes

- Generalize the **captured-JSON transport** from one response per navigation to **many**: `capture(pageUrl, targets)` registers a response waiter per named prefix *before* navigating, drives the page once, and resolves a label-keyed map of parsed bodies. Non-OK on any captured response still throws the shared `TransportError`. The host-limited decorator and limiter are unchanged (host is still derived from the page URL).
- Add a pure domain value object, **`BookingSizeRules`**, holding the four TeeOn `*_bookings` rule values (parsed via a Zod enum that rejects unseen values) with one tested method `bookableGroupSizes(quantityRemaining, slotSize)`. It applies a uniform per-size rule: `allow` → bookable; `allow_within_group` → bookable only when `quantityRemaining < slotSize` (a group exists to join); disallowed → not bookable.
- Teach the **TeeOn scraper** to capture both `tee-time` and `settings/tee-sheet` in one navigation, parse the settings into `BookingSizeRules`, model the previously-ignored `size` field on each row, and derive `groupSizes` from the rules instead of the hardcoded `[1 .. min(quantity_remaining, 4)]`. Resulting `groupSizes` MAY be non-contiguous (the canonical schema already allows an explicit array).
- Commit the `settings/tee-sheet` capture as a fixture (`the-legends-settings-tee-sheet.json`) and a restricted-slot `tee-time` fixture (`the-legends-2026-07-15.json`), so both the parsing and the floor derivation are pinned to real captures.

## Capabilities

### Modified Capabilities

- `scraper-request-limiting`: the captured-JSON navigate-and-capture transport captures multiple named response prefixes per single navigation and resolves a keyed map, instead of a single prefix.
- `tee-time-scraping`: TeeOn derives `groupSizes` from the facility's booking-size rules (captured from `settings/tee-sheet`) and each row's `size`, replacing the hardcoded contiguous `[1 .. min(quantity_remaining, 4)]` floor; a single TeeOn scrape now captures both the guest `tee-time` and `settings/tee-sheet` responses in one navigation.

## Impact

- **Code (`@stt/scraper-core`)**: `transport/captured-json-fetcher.port.ts` (signature change), `transport/playwright-captured-json-fetcher.adapter.ts` and `transport/host-limited-captured-json-fetcher.adapter.ts` (multi-target capture); new `platforms/teeon/teeon-booking-size-rules.ts`; `platforms/teeon/teeon-scraper.adapter.ts` (second capture, `size` modeling, rule-driven group sizes); new `__fixtures__/the-legends-settings-tee-sheet.json` and `__fixtures__/the-legends-2026-07-15.json`.
- **Callers of `CapturedJsonFetcher.capture`**: only the TeeOn scraper uses it today; its call site updates with the port. The signature change is internal to `@stt/scraper-core`.
- **No new npm dependencies**; no change to the canonical `ScrapedTeeTime`/`TeeTime` schema (`groupSizes` is already an explicit, possibly non-contiguous array).
- **External dependency**: adds reliance on TeeOn's `settings/tee-sheet` response shape and its rule vocabulary; a new/unknown rule value fails loudly via Zod rather than silently mis-deriving availability.
- **Manual upkeep**: none — rules are captured live, so a facility changing its booking policy is picked up automatically.
- **Out of scope**: TeeOn dynamic pricing (still deferred); caching the date-independent `settings/tee-sheet` across dates in a run (it rides free on each navigation, so per-call capture is acceptable for now).
