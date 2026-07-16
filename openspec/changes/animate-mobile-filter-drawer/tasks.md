## 1. Dependency

- [ ] 1.1 Add `@base-ui/react` (^1.6.0) to `apps/web` dependencies and install via pnpm at the workspace root
- [ ] 1.2 Confirm the build has no new stylesheet import requirement and that `date-fns`/`@date-fns/tz` optional peers are not pulled in (`pnpm --filter web build`)

## 2. Restructure the mobile sheet into Base UI Drawer parts

- [ ] 2.1 Create a shared drawer handle with `Drawer.createHandle()` and rebind the date-chip button (`mobile-layout.tsx:104`) and Filters button (`:112`) as detached `Drawer.Trigger`s using that handle, removing the `sheetOpen` `useState`
- [ ] 2.2 Replace the conditional `{sheetOpen && ...}` block (`mobile-layout.tsx:126`) with `Drawer.Root` (`swipeDirection="down"`, `modal`), `Drawer.Portal`, `Drawer.Backdrop`, `Drawer.Viewport`, and `Drawer.Popup`
- [ ] 2.3 Split the popup into a non-scrolling header (`shrink-0`, holding the grab-bar `<div>` and the title) and a scrolling `Drawer.Content` (`overflow-y-auto`) wrapping `FilterSections`
- [ ] 2.4 Convert the current plain-`<div>` title (`mobile-layout.tsx:136`) to `Drawer.Title` with the accessible name "Filters"
- [ ] 2.5 Add a `ref` to the mobile-only wrapper in `dashboard.tsx:159` and pass it as `Drawer.Portal container={...}` so the sheet portals into the mobile subtree

## 3. Gesture and animation behavior

- [ ] 3.1 Add `data-base-ui-swipe-ignore` to the earliest-start range slider (`filters.tsx:172`) so adjusting it never starts a dismiss
- [ ] 3.2 Style `Drawer.Popup` open/close transitions with Base UI's `data-starting-style` / `data-ending-style` (slide up on open, slide down on close), gated on `motion-safe:` to honor `prefers-reduced-motion`
- [ ] 3.3 Style `Drawer.Backdrop` fade to match, preserving the existing dark overlay treatment
- [ ] 3.4 Verify the close path (backdrop tap, Escape, swipe) does not depend on a transition completing under reduced motion

## 4. Verify behavior manually

- [ ] 4.1 On a mobile viewport: sheet slides up on open (both buttons), slides down on backdrop tap and on Escape
- [ ] 4.2 Swipe down past threshold dismisses; a short drag settles back open; scrolling the content region does not dismiss
- [ ] 4.3 Dragging the range slider changes its value without dismissing; checkboxes and calendar remain usable
- [ ] 4.4 With `prefers-reduced-motion: reduce`, open/close is motionless and still completes; open the sheet then resize past 768px and confirm it does not linger over the desktop layout
- [ ] 4.5 Run `pnpm format`, `pnpm check-types`, and `pnpm lint`; fix any errors
