## MODIFIED Requirements

### Requirement: Booking action and phone-only slots

For an online-bookable slot the row SHALL render a Book action that opens, in a new tab (`target="_blank" rel="noopener noreferrer"`), the booking URL for the active Players value, or the URL for the maximum group size when Players is Any. The action's visible label SHALL read "Book for N", where N is the party size the link targets: the selected Players value when one is set, or the slot's maximum group size when Players is Any. For a slot with `onlineBookable: false` the row SHALL instead render a non-interactive "Call to book" text label (no button, no link, no tap target). The Book action SHALL carry an accessible label naming the party size, time, and course.

#### Scenario: Book targets selected player count

- **WHEN** the user has Players set to 2 and clicks Book on a slot whose `bookingUrls` has a "2" entry
- **THEN** a new tab opens to that group-size-specific booking URL

#### Scenario: Book label names the selected player count

- **WHEN** the user has Players set to 3
- **THEN** each online-bookable row's Book action reads "Book for 3"

#### Scenario: Book targets max size when Players is Any

- **WHEN** Players is Any and the user clicks Book
- **THEN** a new tab opens to the booking URL for the slot's maximum group size

#### Scenario: Book label names max size when Players is Any

- **WHEN** Players is Any and a slot's maximum group size is 4
- **THEN** that row's Book action reads "Book for 4"

#### Scenario: Phone-only slot shows call label

- **WHEN** a slot has `onlineBookable: false`
- **THEN** the row shows a "Call to book" text label instead of a Book button, and there is no clickable booking element
