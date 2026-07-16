## ADDED Requirements

### Requirement: Mobile filter sheet animates open and closed

The mobile filter bottom sheet SHALL transition into view by sliding up from the bottom edge when opened, and slide back down out of view when closed — whether closed by the backdrop, an explicit close, or a dismiss gesture. The sheet SHALL NOT appear or disappear instantaneously. Under `prefers-reduced-motion: reduce`, the slide SHALL be suppressed and the sheet SHALL open and close without motion; the close behavior SHALL NOT depend on any transition completing.

#### Scenario: Sheet slides up on open

- **WHEN** the user taps the date chip or the Filters button on a viewport below 768px
- **THEN** the filter sheet slides up from the bottom of the screen into its open position

#### Scenario: Sheet slides down when the backdrop is tapped

- **WHEN** the filter sheet is open and the user taps the dark backdrop above it
- **THEN** the sheet slides down off the bottom of the screen and the backdrop clears

#### Scenario: Reduced motion suppresses the slide

- **WHEN** the user has `prefers-reduced-motion: reduce` set and opens or closes the sheet
- **THEN** the sheet appears and dismisses without a sliding transition, and closing still completes reliably

### Requirement: Mobile filter sheet is swipe-to-dismissible

The mobile filter sheet SHALL be dismissible by a downward swipe gesture, so its grab bar is a functional affordance rather than decoration. Dragging the sheet down past a dismissal threshold SHALL close it; a drag that does not reach the threshold SHALL settle the sheet back to its open position. The sheet's scrollable content region SHALL scroll independently, so a swipe that scrolls the body does not dismiss the sheet. The horizontal earliest-start range slider SHALL be excluded from the dismiss gesture, so adjusting it never begins a dismiss.

#### Scenario: Dragging the grab bar down dismisses the sheet

- **WHEN** the user drags the sheet's grab bar downward past the dismissal threshold
- **THEN** the sheet closes with a downward slide

#### Scenario: A short drag settles back open

- **WHEN** the user drags the sheet down but releases before reaching the dismissal threshold
- **THEN** the sheet animates back to its fully open position and stays open

#### Scenario: Scrolling the body does not dismiss

- **WHEN** the sheet content is taller than the sheet and the user swipes to scroll within the content region
- **THEN** the content scrolls and the sheet is not dismissed

#### Scenario: Adjusting the range slider does not dismiss

- **WHEN** the user drags the earliest-start range slider handle
- **THEN** the slider value changes and no dismiss gesture is triggered

### Requirement: Mobile filter sheet traps focus and is labelled

The mobile filter sheet SHALL behave as a modal dialog while open: focus SHALL be trapped within the sheet, the Escape key SHALL close it, and it SHALL expose an accessible name via a dialog title. The sheet SHALL render within the mobile layout subtree so it is not shown when the viewport crosses to the desktop breakpoint while open.

#### Scenario: Escape closes the sheet

- **WHEN** the filter sheet is open and the user presses Escape
- **THEN** the sheet closes with a downward slide

#### Scenario: Sheet has an accessible name

- **WHEN** the filter sheet is open
- **THEN** it is announced as a dialog named "Filters"

#### Scenario: Sheet does not persist across the desktop breakpoint

- **WHEN** the sheet is open on a mobile viewport and the viewport is resized to 768px or wider
- **THEN** the sheet is not shown over the desktop layout
