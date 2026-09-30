# Spec Delta

## ADDED Requirements

### Requirement: Glide when framing with Cmd/Ctrl+click
When Cmd/Ctrl+click frames an annotation (per "Zoom to an annotation") or a burst (per "Zoom to a burst"), the view SHALL move to the framed position as one continuous zoom and pan over a fraction of a second, passing through intermediate zoom levels rather than changing in a single frame. Longer moves SHALL take longer, but no move SHALL take more than about half a second, and the motion SHALL slow down as it arrives. When the target is far from the current view, the path SHALL zoom out on the way and back in, so that the start and the target are both briefly in sight. The view SHALL end exactly where the instant jump would have put it, within the normal zoom and pan limits. Follow mode SHALL turn off when the move starts.

Any other change to the view during the move, whether scroll or pinch zoom, dragging, keyboard zoom or pan, fit, or another navigation, SHALL stop the move at once and apply from the view as it is at that moment. A new Cmd/Ctrl+click during the move SHALL start a new move from the current view to the new target.

When the operating system's reduce-motion setting is on, Cmd/Ctrl+click SHALL change the view in a single step to the same framed position.

All other view changes (`F` and Cmd/Ctrl+0 fit, clicking a decoded-data table row, clicking the overview strip, edge navigation, `+`/`=` and `-`, scroll and pinch zoom, dragging, arrow keys, and follow mode during a live capture) SHALL remain instant.

#### Scenario: Glide into a packet
- **WHEN** the view is zoomed out and the user Cmd+clicks a decoded packet
- **THEN** the time-per-division readout passes through several intermediate values over a fraction of a second, and the view ends with the packet framed exactly as an instant jump would frame it

#### Scenario: Glide into a burst
- **WHEN** the user Cmd+clicks a burst on a channel row
- **THEN** the view glides to frame the burst, ending at the same position as an instant jump

#### Scenario: Far-off target
- **WHEN** the user Cmd+clicks a target whose framed view lies many screen widths from the current one
- **THEN** the view zooms out partway through the move and back in as it arrives

#### Scenario: User input takes over
- **WHEN** a glide is in progress and the user scrolls, drags, presses a zoom key or presses `F`
- **THEN** the glide stops immediately and the user's action applies from the view as it was at that moment, with no further animated frames

#### Scenario: Second Cmd+click during a glide
- **WHEN** a glide is in progress and the user Cmd+clicks another annotation
- **THEN** a new glide starts from the current view towards the new annotation

#### Scenario: Reduce motion
- **WHEN** the operating system's reduce-motion setting is on and the user Cmd+clicks an annotation
- **THEN** the view jumps to frame it in a single step, ending at the same position a glide would

#### Scenario: Already framed
- **WHEN** the user Cmd+clicks an annotation that is already framed exactly
- **THEN** the view does not change

#### Scenario: Other view changes stay instant
- **WHEN** the user presses `F`, clicks a decoded-data table row, clicks the overview strip, jumps to an edge, or presses `+` or `-`
- **THEN** the view changes in a single step, as before
