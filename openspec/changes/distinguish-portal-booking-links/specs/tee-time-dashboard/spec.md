## MODIFIED Requirements

### Requirement: Booking action and phone-only slots

The row's booking affordance SHALL be determined by an exhaustive match on the slot's `booking.kind`, with no fallback branch and no inference from the presence or absence of a URL:

- **`reservation`** — the row SHALL render a Book action that opens, in a new tab (`target="_blank" rel="noopener noreferrer"`), the URL for the active Players value, or the URL for the maximum group size when Players is Any. Its visible label SHALL read "Book for N", where N is the party size the link targets: the selected Players value when one is set, or the slot's maximum group size when Players is Any.
- **`portal`** — the row SHALL render an action that opens the slot's single portal URL in a new tab with the same `rel` treatment. Its visible label SHALL read "Visit site" and SHALL NOT name a party size, because the destination is the course's booking portal where the golfer must still find the slot themselves, and the link's destination does not vary by party size. The label SHALL NOT use the verb "Book", which would promise a booking the link does not perform, and SHALL NOT use the phrase "on site", which idiomatically reads as booking in person.
- **`phone`** — the row SHALL render a non-interactive "Call to book" text label (no button, no link, no tap target).

Both link-bearing actions SHALL carry an accessible label naming the time and course; the `reservation` action's SHALL also name the party size, and the `portal` action's SHALL convey that the destination is the course's booking site where the slot can be found.

#### Scenario: Book targets selected player count

- **WHEN** the user has Players set to 2 and clicks Book on a `reservation` slot whose `booking.urls` has a "2" entry
- **THEN** a new tab opens to that group-size-specific booking URL

#### Scenario: Book label names the selected player count

- **WHEN** the user has Players set to 3
- **THEN** each `reservation` row's Book action reads "Book for 3"

#### Scenario: Book targets max size when Players is Any

- **WHEN** Players is Any and the user clicks Book on a `reservation` slot
- **THEN** a new tab opens to the booking URL for the slot's maximum group size

#### Scenario: Book label names max size when Players is Any

- **WHEN** Players is Any and a `reservation` slot's maximum group size is 4
- **THEN** that row's Book action reads "Book for 4"

#### Scenario: Portal slot does not claim to book

- **WHEN** a slot has `booking.kind` `portal`
- **THEN** its action reads "Visit site" and opens the slot's portal URL in a new tab
- **AND** the label names no party size, whatever the Players value

#### Scenario: Portal label is unaffected by the Players value

- **WHEN** the user sets Players to 2 and a matching `portal` slot is shown
- **THEN** that row's action still reads "Visit site" and opens the same portal URL as when Players is Any

#### Scenario: Phone-only slot shows call label

- **WHEN** a slot has `booking.kind` `phone`
- **THEN** the row shows a "Call to book" text label instead of a Book button, and there is no clickable booking element

### Requirement: Players filter by group-size membership

The Players filter SHALL offer `Any | 1 | 2 | 3 | 4` with a single active value, defaulting to Any. When a value is selected, a tee time SHALL be shown only if its `groupSizes` array includes that value (a membership check, not a `max >= value` comparison). Any SHALL apply no player predicate.

The filter SHALL be independent of the slot's `booking` kind. A slot SHALL NOT be excluded, deprioritized, or annotated because it links to a portal rather than a reservation, or because it cannot be booked online at all: `groupSizes` states which parties the slot can physically hold, while `booking` states how a golfer acts on it. Filtering SHALL be governed by the former alone.

#### Scenario: Non-contiguous group sizes respected

- **WHEN** the user selects 1 player and a tee time has `groupSizes` of `[2,3,4]`
- **THEN** that tee time is hidden even though its maximum group size exceeds 1

#### Scenario: Portal and phone slots are filtered on the same terms as reservation slots

- **WHEN** the user sets Players to 2 and slots of all three booking kinds have 2 among their `groupSizes`
- **THEN** all of them are retained
- **AND** each renders the booking affordance for its own kind
