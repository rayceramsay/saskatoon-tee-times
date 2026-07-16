## Context

The mobile filter sheet in `MobileLayout` (`apps/web/src/components/mobile-layout.tsx:126`) is conditionally mounted:

```tsx
{sheetOpen && (
  <>
    <button aria-label="Close filters" onClick={...} className="absolute inset-0 z-20 bg-black/35" />
    <div className="bg-panel absolute inset-x-0 bottom-0 z-30 max-h-[88%] overflow-y-auto rounded-t-2xl pb-8">
      <div className="bg-line mx-auto mt-2.5 h-1 w-9 rounded-full" />  {/* cosmetic grab bar */}
      ...
```

Three consequences:

1. **No enter animation** — React inserts the element already at its final position, so there is nothing to transition from.
2. **No exit animation** — on close the node is removed in the same frame; there is no element left to animate.
3. **The grab bar is a lie** — a styled `<div>` with no pointer handlers, signalling a swipe gesture that does not exist.

There is also a structural issue: the sheet *is* its own scroll container (`overflow-y-auto` on the same div that holds the grab bar and title), so a "drag down to dismiss" gesture would be ambiguous with "scroll up." A real drag handle must live outside the scroll region.

The sheet is not a true modal either: Escape does not close it, focus is not trapped, and there is no `role="dialog"`/`aria-modal`. The full-screen `<button>` overlay is doing all the dismissal work.

The frontend dependency set is deliberately lean — `next`, `react`, `swr`, `zod`, nothing else. Any library added here sets precedent.

## Goals / Non-Goals

**Goals:**

- Slide the mobile filter sheet up on open and down on close, including backdrop dismissal.
- Make the grab bar a real swipe-to-dismiss affordance.
- Split the sheet into a non-scrolling header (grab bar + title) and a scrolling body so drag and scroll stop competing.
- Respect `prefers-reduced-motion`, consistent with the rest of the frontend; the close path must not depend on a transition finishing.
- Establish Base UI as the intended direction for frontend UI primitives — this is the first adoption.

**Non-Goals:**

- Desktop layout and the desktop popup calendar (`filters.tsx:392`), which has the same instant-appear pattern but is explicitly out of scope this round.
- Snap points / partial-height rest states for the sheet.
- Migrating existing controls (toggles, buttons, calendar) to Base UI. Only the drawer is adopted now; broader migration is future work this change merely opens the door to.

## Decisions

### Use Base UI (`@base-ui/react`) Drawer

Chosen mechanism: the `Drawer` component from `@base-ui/react`, imported via its tree-shakeable `./drawer` subpath.

Facts verified against the published `@base-ui/react@1.6.0` tarball (not documentation, which was inaccurate in two places):

- **Stable release**, not a release candidate. (The older package name `@base-ui-components/react` is stuck at `1.0.0-rc.0` and has no drawer — a red herring.)
- **No CSS import required** — the component injects nothing and ships no stylesheet; parts are styled directly with Tailwind.
- **`date-fns` / `@date-fns/tz` peers are `optional: true`** and unused by the drawer.
- Small real dependency set: `@floating-ui/react-dom`, `@floating-ui/utils`, `use-sync-external-store`, `@base-ui/utils`, `@babel/runtime`.
- React 19 is in the peer range (`^17 || ^18 || ^19`).

Relevant API (confirmed from the tarball's type definitions):

- `swipeDirection="down"` on `Drawer.Root` (the default) provides swipe-to-dismiss with no hand-written pointer math.
- Drag scoping is **opt-out**: put `data-base-ui-swipe-ignore` on elements that must not start a swipe — namely the `type="range"` slider at `filters.tsx:172`. Everything else remains draggable (the full-surface iOS feel).
- `Drawer.Portal container={...}` accepts a DOM node, letting us portal into the mobile-only wrapper.
- `modal` accepts `true | false | 'trap-focus'`; we get Escape, focus trap, and scroll lock without a native `<dialog>`.
- Animation is data-attribute driven (`data-starting-style`, `data-ending-style`, `data-swiping`) plus CSS vars like `--drawer-swipe-progress`.

**Terminology note — two different "handles":** Base UI exports `Drawer.createHandle()` / `Drawer.Handle` (a `DialogHandle` *class*) — an imperative controller (`.open(triggerId)`, `.close()`, `.isOpen`) for associating detached triggers with a drawer. It renders no DOM and is unrelated to dragging. The visual grab-bar *component* Vaul shipped as `<Drawer.Handle />` **does not exist** in Base UI; the grab bar stays a plain styled `<div>`, made functional by the surface-wide swipe gesture rather than by any dedicated part.

### Two triggers, one drawer — via the imperative handle

The bottom bar has two buttons that both open the sheet (date chip at `mobile-layout.tsx:104`, Filters at `:112`). Rather than lift `open`/`onOpenChange` state, bind both buttons as detached `Drawer.Trigger`s sharing one `Drawer.createHandle()`. This removes the `sheetOpen` `useState` entirely.

Fallback: if wiring two differently-styled triggers to one handle proves awkward, revert to a controlled `open`/`onOpenChange` pair — behaviorally identical, slightly more local state.

### Restructure into header + scrolling body

```
Drawer.Root  (swipeDirection="down", modal, shared handle)
└ Drawer.Portal  container={mobileWrapperRef}
  ├ Drawer.Backdrop        ← replaces the full-screen <button> scrim
  └ Drawer.Viewport
    └ Drawer.Popup         ← flex flex-col, rounded-t, max-h ~88%
      ├ header (shrink-0)  ← grab-bar div + Drawer.Title (title was a plain <div>)
      └ Drawer.Content     ← overflow-y-auto; FilterSections; slider marked data-base-ui-swipe-ignore
```

The grab bar and title sit in the non-scrolling header so dragging them is unambiguously a dismiss.

### Why not Vaul

Vaul was the obvious first pick — it is the de-facto React drawer and ships inside shadcn/ui. Rejected for two reasons:

1. **Dormant.** Latest release `1.1.2` (Dec 2024); newest commits sit unreleased on `main`. Not archived, 8.5k stars, so breakage would be noticed — but it is not shipping. Crucially, Vaul's value is almost entirely mobile-Safari workarounds (virtual-keyboard repositioning, scroll lock/restoration, drag↔scroll arbitration). Frozen browser workarounds are a *decaying* asset in a way a frozen date library is not, because iOS keeps moving. The staleness bites exactly where the library earns its keep.
2. **Most of what it does, we do not need.** This sheet has no text inputs (only `type="checkbox"` and `type="range"`), so keyboard repositioning is irrelevant; the layout is already `h-screen overflow-hidden`, so body scroll lock is marginal; snap points and nested drawers are unused. The one genuinely tricky thing we need — drag vs. scroll arbitration — disappears by construction once the drag surface is the non-scrolling header.

Base UI gives the same swipe/animation ergonomics from an actively maintained, stable package (pushed within the last month) that we intend to standardize on anyway, so the dependency is not single-use.

### Why not hand-rolled `<dialog>` + CSS

A native `<dialog>` with `showModal()` plus Tailwind v4's `starting:` / `transition-discrete` / `allow-discrete` (all confirmed present in the installed `tailwindcss@4.3.2`) would deliver the slide, Escape, focus trap, and inert background with zero dependencies — the strongest "add nothing" option.

Rejected because the swipe gesture is still ~60–80 lines of hand-written pointer handling (velocity thresholds, rubber-banding, `pointercancel`, releasing exactly at threshold) that has no test coverage here, and because the stated direction is to adopt Base UI across the frontend. Hand-rolling this one drawer would be throwaway effort against that direction. Base UI supplies the gesture, the a11y, and a reusable pattern in one move.

## Risks / Trade-offs

- **No component tests in `apps/web`.** Only lib utils are tested, so drag behavior lands unverified by the suite — verification is manual on a phone. Mitigation: keep the structure simple (no snap points), lean on Base UI's tested gesture.
- **Portal escapes `md:hidden`.** `dashboard.tsx:159` wraps `MobileLayout` in `md:hidden`, but a portal renders to a sibling of that wrapper by default, so the class cannot hide it — open the sheet on mobile, resize past 768px, and it lingers. Mitigated by passing `Drawer.Portal container={mobileWrapperRef}` to portal into the mobile wrapper. Edge case (requires a live resize with the sheet open), but cheap to prevent.
- **Base UI API surface for one component.** We adopt a library to ship a single drawer. Justified only because Base UI is the declared frontend direction; if that intent changed, the hand-rolled `<dialog>` option becomes preferable and this decision should be revisited.
- **Reduced motion.** The animation must gate on `prefers-reduced-motion` (the codebase is consistent about `motion-safe:` and the shimmer has a static fallback), and the close logic must not wait on a transition that will not fire. Base UI's `onOpenChangeComplete` / imperative unmount give a transition-independent close path.
- **`Drawer.Title` is required for a11y.** The current title is a plain `<div>` (`mobile-layout.tsx:136`); it must become `Drawer.Title` or the dialog is unlabelled.
