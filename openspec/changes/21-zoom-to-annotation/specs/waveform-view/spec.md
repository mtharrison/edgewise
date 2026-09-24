## ADDED Requirements

### Requirement: Zoom to an annotation
While Cmd (macOS) or Ctrl (Windows and Linux) is held, the annotation on a decoder row under the pointer SHALL be highlighted, including when the key is pressed or released without moving the pointer. Cmd/Ctrl+click on an annotation SHALL zoom and pan the view so that the annotation is centred and fills the plot width except for a small margin on each side, within the normal zoom limits, and SHALL turn follow mode off. When the annotation is a merged block of narrow annotations, the whole block SHALL be framed. Cmd/Ctrl+click where there is no annotation SHALL change nothing. A modified click SHALL NOT start a pan or select a row in the decoded-data table.

#### Scenario: Frame a byte
- **WHEN** the user holds Cmd over a UART annotation and clicks
- **THEN** that annotation is centred and spans nearly the whole plot width, and follow mode is off

#### Scenario: Highlight follows the modifier key
- **WHEN** the pointer rests on an annotation and the user presses Cmd without moving
- **THEN** the annotation is highlighted, and the highlight clears when Cmd is released

#### Scenario: Frame a packet from far out
- **WHEN** the view is zoomed out so a burst of UART bytes is drawn as one merged block, and the user Cmd+clicks it
- **THEN** the view frames the whole burst, showing its individual bytes

#### Scenario: Empty space
- **WHEN** the user Cmd+clicks a decoder row where there is no annotation
- **THEN** the view does not change

#### Scenario: Very short annotation
- **WHEN** the user Cmd+clicks an annotation only a few samples long
- **THEN** the view zooms in as far as the zoom limit allows and centres it

#### Scenario: Plain click unchanged
- **WHEN** the user clicks an annotation without Cmd
- **THEN** the view does not zoom and the annotation is selected in the decoded-data table, as before
