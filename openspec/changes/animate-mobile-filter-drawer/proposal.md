## Why

On mobile, tapping the date chip or Filters button makes the filter bottom sheet appear and disappear instantly, with no transition. The sheet also renders a grab bar that signals "drag me to dismiss," but the bar is a cosmetic `<div>` with no gesture behind it — an affordance that lies. The result feels unfinished next to the native bottom sheets users expect on a phone.

## What Changes

- The mobile filter sheet SHALL slide up when opened and slide down when closed, including when closed by tapping the backdrop, so open and close are animated rather than instantaneous.
- The sheet SHALL support swipe-to-dismiss (drag down past a threshold to close); the grab bar becomes a genuine affordance for that gesture instead of decoration.
- The sheet's inner region SHALL scroll independently of the header (grab bar + title), so dragging the header dismisses while scrolling the body does not — the two gestures stop competing.
- The horizontal earliest-start range slider SHALL be excluded from the drag gesture so adjusting it never starts a dismiss.
- Animation SHALL respect `prefers-reduced-motion`, consistent with the rest of the frontend, and the close path SHALL NOT depend on a transition completing.
- Adopt **Base UI** (`@base-ui/react`) as the mechanism, replacing the hand-rolled conditional-mount sheet. This is the frontend's **first Base UI adoption** and establishes Base UI as the intended direction for future UI primitives (dialogs, popovers, menus).
- Desktop is untouched: the desktop popup calendar keeps its current instant behavior and is explicitly out of scope.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `tee-time-dashboard`: the "Responsive layouts" requirement's mobile bottom sheet gains defined open/close animation, backdrop-dismiss, and swipe-to-dismiss behavior. Today the spec only says a Filters button "opens a bottom sheet"; it says nothing about how the sheet enters, exits, or is dismissed.

## Impact

- **Code**: `apps/web/src/components/mobile-layout.tsx` (the sheet at lines 126–142 is restructured into Base UI Drawer parts; the two bottom-bar buttons become the drawer's triggers). Possible small touch to `apps/web/src/components/filters.tsx` to mark the range slider as drag-excluded.
- **Dependencies**: add `@base-ui/react` (^1.6.0) to `apps/web`. Tree-shakeable via its `./drawer` subpath; no stylesheet import required; `date-fns`/`@date-fns/tz` peers are optional and unused by the drawer.
- **Styling**: the mobile sheet is re-expressed with Base UI's data-attribute animation model (`data-starting-style` / `data-ending-style`) in place of conditional mounting.
- **Testing**: `apps/web` has no component tests (only lib-util tests), so verification is manual on a mobile viewport. No automated coverage is added or broken by this change.
- **Out of scope**: desktop layout, the popup calendar, and any broader Base UI migration of existing controls.
