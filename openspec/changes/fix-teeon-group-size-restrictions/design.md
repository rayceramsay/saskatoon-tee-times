## Context

The TeeOn `guest/tee-time` feed carries no minimum-group-size signal — verified by a full field-level diff of a restricted row (2:48pm, "2 - 4 Players") against an unrestricted one (12:00, "1 Player") on 2026-07-15: identical but for `id`/`position`/`start_time`/`quantity_remaining`. The floor is derived from the facility's `guest/facility/settings/tee-sheet` response and each row's `size` (open-slot capacity). This design covers two seams: how the capture transport fetches a second response on the same navigation, and how the booking rules become a set of group sizes.

## Decision 1 — Separate rule *interpretation* from rule *source*

The logic that turns the four `*_bookings` settings into a set of bookable sizes is identical regardless of where the values come from. So interpretation lives in a pure, isolated value object; the source (a captured response) is the only I/O-bound part.

```
                          BookingSizeRules (pure, tested in isolation)
 settings/tee-sheet ──▶  { single, twosome, threesome, foursome }
                          .bookableGroupSizes(quantityRemaining, slotSize) ─▶ GroupSize[]
```

**Uniform per-size rule** (applied for each candidate size `g` in `1 .. min(quantityRemaining, 4)`):

| rule value            | bookable at size `g`?                         |
| --------------------- | --------------------------------------------- |
| `allow`               | yes                                           |
| `allow_within_group`  | only if `quantityRemaining < slotSize` (a group exists to join) |
| anything disallowing  | no                                            |

Worked against the empty 2:48pm slot (`quantityRemaining == slotSize == 4`; single = `allow_within_group`, rest `allow`): `g=1` blocked (empty, within-group only), `g=2..4` allowed ⇒ `{2,3,4}` = "2 - 4 Players". Against the partially-filled 12:00 (`quantityRemaining 1 < slotSize 4`): `g=1` allowed (a group exists) ⇒ `{1}`.

The result MAY be non-contiguous (e.g. `twosome` disallowed but single and threesome allowed ⇒ `{1,3}`); the canonical `groupSizes` schema already permits an explicit array, so no schema change is needed.

**Rejected — hardcode the rules in `TeeOnCourseConfig`.** It removes the extra capture, but the values silently drift when a facility changes its policy — reproducing exactly the wrong-availability failure being fixed — and needs manual upkeep per course. Capturing live self-corrects and, because the response rides on a navigation we already do, costs almost nothing.

### Unknown rule values fail loudly

Only `allow` and `allow_within_group` have been observed. `disallow` (and possibly others) are inferred. The rule field is a Zod enum that **rejects** unrecognized values, so an unseen value surfaces as a validation error against the committed fixture — not silent bad availability. This matches the project's "fail loudly and early" principle. When a disallow-style value is observed, it is added to the enum with its interpretation.

## Decision 2 — Multi-target capture on one navigation

`CapturedJsonFetcher.capture(pageUrl, responseUrlPrefix)` captures one response. The SPA fires both `tee-time` and `settings/tee-sheet` on a single portal load, so the port generalizes to capture several named prefixes in one navigation.

```
interface CapturedJsonFetcher {
  capture(pageUrl: string, targets: Record<string, string>): Promise<Record<string, unknown>>;
}
// e.g. capture(portalUrl, { teeTime: teeTimePrefix, settings: settingsPrefix })
//   ─▶ { teeTime: <parsed>, settings: <parsed> }
```

The Playwright adapter registers a `waitForResponse` per target **before** `page.goto`, navigates once, awaits all, and returns the label-keyed parsed bodies. A non-OK on any captured response throws the shared `TransportError` (unchanged status/`Retry-After` semantics). The host-limited decorator still derives the scheduling host from `pageUrl`, so limiting is untouched.

**Why label-keyed over positional (`string[] -> unknown[]`)**: the caller must tell `tee-time` from `settings`; a label map is self-documenting and order-independent. Single-response callers pass a one-entry map.

**Rejected — a second `capture` call for settings.** It would re-navigate the portal (a second page load, a second limiter slot) to fetch a response that already flew by on the first navigation. Wasteful for data that is already on the wire.

## Decision 3 — Capture settings every scrape; no cross-date cache (for now)

`settings/tee-sheet` is date-independent, so a multi-date run re-captures identical bytes per date. Caching per facility would need cross-call state in the scraper or transport. Since the response rides on the same navigation already performed per date, re-capturing is nearly free, and a cache adds state and invalidation questions for little gain. Deferred; noted as a future optimization if navigations become the bottleneck.

## Open questions / weak inferences

- **"Within group" == `quantityRemaining < slotSize`** held for all three observed rows but is an inference. A partially-filled slot that still enforces a floor above 1 (e.g. a twosome-only slot with one seat taken) would test it; none captured yet.
- **`twosome`/`threesome`/`foursome` never observed as anything but `allow`.** The uniform model handles other values, but their real semantics (especially any `allow_within_group` for a multi-seat size) are unconfirmed.
- **Placement of `BookingSizeRules`.** It uses TeeOn's rule vocabulary, so it lives under `platforms/teeon/`. If a second platform ever exposes the same "join-only" concept, promoting the group-size derivation to the domain layer can be revisited then.
