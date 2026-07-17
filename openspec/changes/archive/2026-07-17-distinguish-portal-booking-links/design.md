## Context

Booking links reach the dashboard as `bookingUrls: Partial<Record<GroupSize, string>>` plus a sibling `onlineBookable: boolean`. The map's shape asserts that each group size has its own URL, which is true for Chronogolf V1/V2 (deep links carrying `affiliation_type_ids` repeated per player) and WebTrac (a cart URL with a size parameter), but false for TeeOn: `buildRecords` loops over the group sizes assigning the *identical* date-filtered portal URL to each. The dashboard reads the map, finds a URL, and renders "Book for N" — correct for the first three platforms, misleading for TeeOn, where the link neither books nor respects N.

Three properties of the current model motivate replacing it rather than annotating it:

1. **The distinction is erased on purpose.** `bestBookingUrl(...candidates)` collapses "deep link, else dated portal, else portal" to the first non-null string. Its two callers (`chronogolf-v1-scraper.adapter.ts:286`, `chronogolf-v2-scraper.adapter.ts:223`) pass `buildReservationDeepLink(...)` as the first candidate, and both those functions return `string`, not `string | null`. The fallback is unreachable; the helper's only effect is to hide the URL's provenance.
2. **It cannot be recovered downstream.** The tempting inference — "all URLs identical ⇒ portal" — misfires on any slot with a single group size, where one deep link is trivially "all identical". The kind must be carried, not derived.
3. **`onlineBookable` and `bookingUrls` are an unenforced invariant pair.** Nothing in the schema ties `onlineBookable: false` to an empty map, so `booking-action.tsx:19` pays for it defensively with `!slot.onlineBookable || href === undefined`.

## Goals / Non-Goals

**Goals:**

- Carry the booking-link kind from scrape to render so the dashboard can tell the golfer the truth about where a click leads.
- Make illegal states unrepresentable: no "bookable with no URL", no "phone-only with a deep link".
- Remove the unreachable fallback (`bestBookingUrl`) and the duplicate config field (`TeeOnCourseConfig.portalUrl`) it forced into existence.

**Non-Goals:**

- Building TeeOn deep links. The slot→variant resolution is unsolved and deferred to the pricing follow-up. If it lands, The Legends simply moves to the `reservation` arm; nothing else changes.
- Changing which slots appear or how they filter. `groupSizes` and the Players filter are untouched.
- Reworking pricing, persistence, or the API beyond the shape rename.

## Decisions

### Model booking as a three-arm discriminated union on the slot

```ts
type Booking =
  | { kind: 'reservation'; urls: Partial<Record<GroupSize, string>> }
  | { kind: 'portal'; url: string }
  | { kind: 'phone' };
```

replacing both `bookingUrls` and `onlineBookable` on `BaseTeeTime`.

The arms are exhaustive along one ordered axis — **how much work the golfer does to reach this specific slot**:

```
none ...... deep link lands on the slot ──────▶ reservation   "Book for 4"
some ...... land on the portal, find it ─────▶ portal        "Visit site"
can't ..... phone or in person only ─────────▶ phone         "Call to book"
```

That axis is why there are three arms and not four: a slot is bookable online directly, bookable online after you find it, or not bookable online. A "portal link that is phone-only" is not a thing — the arms do not compose. This completeness argument is what justifies a closed union over a bag of optional fields.

The per-size map lives *inside* the reservation arm, which is the only place per-size structure is real. The portal arm holds one `url`, which deletes TeeOn's fake per-size loop at the source.

**Alternatives considered:**

- *Sibling `bookingUrlKind` field alongside `bookingUrls`.* Smallest diff, but yields three fields that must agree (`onlineBookable`, `bookingUrls`, `bookingUrlKind`) and no answer for "what is the kind when `onlineBookable: false`?". It grows the illegal-state surface the union exists to shrink.
- *Per-URL kind (`Record<GroupSize, { url, kind }>`).* More expressive than reality warrants. No platform produces mixed kinds within a slot, and none can: the kind is a property of the platform's linking capability, not of a party size.
- *Infer in the UI.* Wrong, per Context item 2.

### Keep `CourseConfig.bookingPortalUrl`; delete `TeeOnCourseConfig.portalUrl`

The Legends config carries both fields holding the identical string. They are the same concept: `bookingPortalUrl` means "where a golfer goes to book this course", and TeeOn's scraper must drive exactly that page because the guest feed is session-gated behind it. The fetcher target and the portal arm's link cannot diverge for a portal-kind course — that identity is essentially what portal-kind *means*. Two fields for one unsplittable value is one too many.

`bookingPortalUrl` survives as the single field because it already carries the right meaning across all 7 course configs and it is the base-level, platform-independent fact. `portalUrl` exists only because the base name was taken by the unreachable fallback; with that gone, the duplicate has no reason to exist. This also gives `bookingPortalUrl` its first real reader — before this change it had 7 writers and 0 effective reads.

Date filtering stays platform-local (`buildPortalUrl` in the TeeOn adapter). The base field holds the bare portal URL, which is what all 7 configs already contain.

**Alternative considered:** *Split by role — `bookingPortalUrl` for the link, `portalUrl` for the scrape target.* Renames the duplication instead of removing it, since for TeeOn the two roles hold one value. If a future platform's scrape target is genuinely unrelated to its portal (say a bare API endpoint), that URL belongs on *that* platform's config and never touches the base field.

### Document what "portal" means

`bookingPortalUrl`'s JSDoc currently reads "General booking portal URL for the course." Reading the 7 values cold, it is easy to assume *portal* means *the booking platform's URL* and conclude the field is inconsistent — Greenbryre points at `greenbryre.com/book-a-tee-time/` rather than `chronogolf.ca`. It is not inconsistent: the portal is wherever a golfer books that course, which for several courses is the course's own site. The platform is an implementation detail the golfer never sees.

That distinction is load-bearing, unguessable from the type (`string`), and the field is about to become the portal arm's source. The JSDoc must state it outright. This is a constraint the code cannot show, which is exactly what the project's comment policy reserves comments for.

### "Visit site" for the portal arm

Short (matching "Book for 4"), and it avoids the trap that kills the obvious candidates: **"on site" is the idiom for "physically present"**, so "Book on site" and "Find on site" both read as *book in person* — the opposite of the truth. The verb "Book" is dropped entirely for this arm, since the whole point is that the link does not book; keeping the verb would restate the lie in fewer words.

The visible label stays terse because the `aria-label` carries the description ("Visit The Legends' booking site to find the 9:20 AM tee time"), and the button is `w-full` — width is column-constrained, so terseness buys clarity rather than space.

### `bookingUrlFor` becomes reservation-arm-internal

Party-size URL selection (selected Players, else max group size) is meaningful only for the reservation arm. The Players filter tests `groupSizes` membership and never consults `booking` — a portal slot is fully eligible for Players=2; the link is directional help, not the filter's subject. `booking-action.tsx` becomes an exhaustive switch on `booking.kind` with no fallback branch, retiring the defensive guard at line 19.

## Risks / Trade-offs

- **Stale web bundle reading new items** → The scraper ships before or with the web app. The API reads no booking fields, so it tolerates both shapes; only the browser bundle is order-sensitive.
- **Mixed item shapes in DynamoDB during rollout** → Self-healing, no backfill. The writer spreads the whole `TeeTime` into each item and `replaceUnitTeeTimes` reconciles per scrape unit wholesale, so every item converges within one 15-minute cycle. The window is bounded by the cycle, not by a migration job.
- **Zod union parse errors are noisier than field errors** → Use a discriminated union (`z.discriminatedUnion('kind', ...)`), not a plain `z.union`, so failures report against the matched arm instead of dumping every arm's errors.
- **The union is wider than today's data needs** → The `portal` arm has exactly one producer (TeeOn). That is a real cost, accepted: the arm encodes a permanent category (platforms whose deep links we cannot or will not build), not a TeeOn quirk. If TeeOn deep links ever land, the arm still earns its place for the next such course.
- **Rollback** → Revert and redeploy the scraper; items reconcile back to the old shape within one cycle, same mechanism forward and back.
