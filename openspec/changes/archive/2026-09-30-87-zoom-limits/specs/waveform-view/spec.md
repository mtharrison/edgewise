## MODIFIED Requirements

### Requirement: Zoom, pan and fit
The user SHALL be able to zoom around the pointer with the scroll wheel or trackpad pinch and with `+`/`=` and `-`, pan by dragging, with horizontal or shift-scroll, and with the left and right arrow keys (20% of the width per press), and fit the whole capture with `F` or Cmd/Ctrl+0. Zoom SHALL be limited to between 64 pixels per sample at most and, zoomed out, the whole capture plus 10 ms of empty time before its start and 10 ms after its end. Panning, and any navigation that moves the view, SHALL keep the view within 10 ms before the start and 10 ms after the end of the capture.

#### Scenario: Maximum zoom
- **WHEN** the user keeps zooming in
- **THEN** zoom stops at 64 pixels per sample

#### Scenario: Maximum zoom out
- **WHEN** the user keeps zooming out on a 100 ms capture
- **THEN** zoom stops with the view spanning from 10 ms before the capture start to 10 ms after the capture end

#### Scenario: Pan past the start
- **WHEN** the user drags or presses the left arrow key repeatedly while zoomed in near the capture start
- **THEN** the view stops with its left edge 10 ms before the capture start

#### Scenario: Pan past the end
- **WHEN** the user drags or presses the right arrow key repeatedly while zoomed in near the capture end
- **THEN** the view stops with its right edge 10 ms after the capture end

#### Scenario: Fit is unchanged
- **WHEN** the user presses `F` after zooming out fully
- **THEN** the whole capture fills the plot width with no empty time either side
