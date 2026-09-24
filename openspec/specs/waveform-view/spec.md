# waveform-view Specification

## Purpose
Shows captured signals and decoded protocol data on a zoomable timeline, with tools to navigate, measure and inspect them, even for captures with hundreds of millions of samples.
## Requirements
### Requirement: Waveform rendering
The waveform SHALL draw each visible channel as a digital trace. When several samples share one screen pixel, the trace SHALL show that pixel's starting level, and any pixel where the channel toggled SHALL be drawn as a solid vertical bar so no transition is hidden. When zoomed in past one sample per pixel, each sample SHALL be drawn as an exact step. High levels SHALL have a light fill. Time outside the capture SHALL be shaded.

#### Scenario: Narrow glitch while zoomed out
- **WHEN** a one-sample pulse occurs inside a range of thousands of samples that map to one pixel
- **THEN** that pixel shows a toggle bar on the channel

### Requirement: Rendering scales to large captures
Drawing a view and searching for edges SHALL take time proportional to the number of screen pixels or level changes, not the number of samples in the capture.

#### Scenario: Fit a long idle capture
- **WHEN** a capture of hundreds of millions of mostly idle samples is fitted to the window
- **THEN** it renders without noticeable delay

### Requirement: Zoom, pan and fit
The user SHALL be able to zoom around the pointer with the scroll wheel or trackpad pinch and with `+`/`=` and `-`, pan by dragging, with horizontal or shift-scroll, and with the left and right arrow keys (20% of the width per press), and fit the whole capture with `F` or Cmd/Ctrl+0. Zoom SHALL be limited to between 64 pixels per sample at most and, zoomed out, the whole capture filling a quarter of the width. Panning SHALL allow at most half a screen of empty space beyond either end.

#### Scenario: Maximum zoom
- **WHEN** the user keeps zooming in
- **THEN** zoom stops at 64 pixels per sample

### Requirement: Follow mode
The view SHALL fit the whole capture automatically after each status update while follow mode is on. Starting a capture or opening a file SHALL turn follow mode on; any manual zoom, pan, the `F` key, or navigation from the overview, edges or table SHALL turn it off.

#### Scenario: Watch a capture grow
- **WHEN** a capture is running and the user has not zoomed or panned
- **THEN** the view keeps fitting the growing capture

### Requirement: Time ruler and grid
The waveform SHALL show a time ruler with labels on a 1-2-5 step of about 120 pixels, labelled with a unit (s, ms, µs, ns, ps) and just enough decimals for the step, with four minor ticks between labels and matching grid lines. The trigger position, if any, SHALL be drawn as a dashed line with a "T" flag.

#### Scenario: Ruler precision
- **WHEN** the tick step is 0.5 µs
- **THEN** labels show one decimal place in µs

### Requirement: Overview strip
An overview strip above the waveform SHALL show activity across the whole capture, with a bar per pixel sized by how many visible channels toggle there, and a highlighted box for the visible window. Clicking or dragging in the strip SHALL centre the view on that point.

#### Scenario: Jump from overview
- **WHEN** the user clicks near the end of the overview strip
- **THEN** the waveform view centres on that part of the capture

### Requirement: Time markers
The user SHALL be able to place markers A and B by clicking the ruler (A first, then B), by pressing `A` or `B` at the pointer, and move them by dragging near them on the ruler. Double-clicking the ruler, pressing Escape, or "Clear" in the Timing panel SHALL remove both. The Timing panel SHALL show the cursor, A and B times, the A-to-B interval, and its reciprocal as a frequency. The region between A and B SHALL be tinted.

#### Scenario: Measure an interval
- **WHEN** the user places A and B 1 ms apart
- **THEN** the Timing panel shows Δ A→B of 1 ms and 1 / Δ of 1 kHz

### Requirement: Edge navigation
Pressing `]` or `[` SHALL move to the next or previous transition on the channel under the pointer (or the first visible channel), starting from the pointer (or the centre of the view), and centre the view on it.

#### Scenario: Step through edges
- **WHEN** the pointer is over D2 and the user presses `]`
- **THEN** the view centres on D2's next transition

### Requirement: Hover pulse measurement
Hovering over a channel SHALL highlight the pulse under the pointer and show a tooltip with its level (High or Low) and width. When the pulse is bounded by transitions on both sides and followed by another transition, the tooltip SHALL also show the period, frequency and duty cycle.

#### Scenario: PWM duty cycle
- **WHEN** the user hovers a pulse on a 10 kHz PWM signal
- **THEN** the tooltip shows a 100 µs period, 10 kHz frequency and the duty cycle

### Requirement: Channel labels
Each channel SHALL show its colour, index (`D<n>`) and name. Double-clicking the name SHALL rename it (an empty name reverts to `D<n>`). Each label SHALL have a trigger button and a hide button, and the gutter SHALL offer "Show <n> hidden" when channels are hidden. Hidden channels SHALL be excluded from the waveform and the overview.

#### Scenario: Rename a channel
- **WHEN** the user double-clicks D0's name and types "TX"
- **THEN** D0 is labelled "TX" in the waveform, the decoder settings and saved files

### Requirement: Decoder rows on the waveform
Each visible decoder's rows SHALL be placed directly under the highest-numbered visible channel it reads, or at the end if none are visible. Annotations SHALL be drawn as coloured boxes with text that is truncated with an ellipsis to fit, and without text when narrower than about 14 pixels.

#### Scenario: I²C rows placement
- **WHEN** an I²C decoder reads D1 and D2
- **THEN** its Data and Events rows appear directly under D2

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

### Requirement: Zoom to a burst
While Cmd (macOS) or Ctrl (Windows and Linux) is held, the burst under the pointer on a channel row SHALL be highlighted, including when the key is pressed or released without moving the pointer. A burst SHALL be a run of transitions on that channel in which every gap between consecutive transitions is shorter than an idle threshold of a few pixels at the current zoom. The pointer is on a burst when it lies between its first and last transition, or within a couple of pixels of them. Cmd/Ctrl+click on a burst SHALL zoom and pan the view so that the burst is centred and fills the plot width except for the same margin used for annotations, within the normal zoom limits, and SHALL turn follow mode off. Cmd/Ctrl+click on a channel row where there is no burst SHALL change nothing. A modified click on a channel row SHALL NOT start a pan. Decoder rows SHALL keep the behaviour of "Zoom to an annotation".

#### Scenario: Frame a burst
- **WHEN** a channel with no decoder shows a burst of data between long idle stretches, and the user holds Cmd over the burst and clicks
- **THEN** the burst is centred and spans nearly the whole plot width, and follow mode is off

#### Scenario: Highlight follows the modifier key
- **WHEN** the pointer rests on a burst and the user presses Cmd without moving
- **THEN** the whole burst is highlighted, and the highlight clears when Cmd is released

#### Scenario: Pointer in a short gap inside a burst
- **WHEN** the pointer is over a gap between two transitions of a burst, and the gap is shorter than the idle threshold
- **THEN** the whole burst is highlighted, as if the pointer were on a transition

#### Scenario: Idle stretch
- **WHEN** the user Cmd+clicks a channel row on a stretch with no transitions within the idle threshold
- **THEN** the view does not change and no pan starts

#### Scenario: Single isolated transition
- **WHEN** the user Cmd+clicks next to a transition whose neighbours on both sides are further away than the idle threshold
- **THEN** the view does not change

#### Scenario: Refine after framing
- **WHEN** the user has framed a burst and its bytes are now separated by gaps wider than the idle threshold, and the user Cmd+clicks one byte
- **THEN** the view frames that byte

#### Scenario: Very short burst
- **WHEN** the user Cmd+clicks a burst only a few samples long
- **THEN** the view zooms in as far as the zoom limit allows and centres it

#### Scenario: Decoder rows unchanged
- **WHEN** the user Cmd+clicks an annotation on a decoder row
- **THEN** the annotation is framed as before

### Requirement: Decoded-data table
A table SHALL list one decoder row's annotations with index, time and value, show the total row count (or "decoding…" while busy), and let the user switch decoder and row. It SHALL load only the visible part so that very long lists scroll smoothly. Clicking a table entry SHALL centre the waveform on that annotation, zooming in if it would be narrower than 24 pixels. Clicking an annotation on the waveform SHALL select and scroll to it in the table.

#### Scenario: Jump from table
- **WHEN** the user clicks a table entry
- **THEN** the waveform centres on that annotation and the entry is highlighted

