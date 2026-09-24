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

### Requirement: Decoded-data table
A table SHALL list one decoder row's annotations with index, time and value, show the total row count (or "decoding…" while busy), and let the user switch decoder and row. It SHALL load only the visible part so that very long lists scroll smoothly. Clicking a table entry SHALL centre the waveform on that annotation, zooming in if it would be narrower than 24 pixels. Clicking an annotation on the waveform SHALL select and scroll to it in the table.

#### Scenario: Jump from table
- **WHEN** the user clicks a table entry
- **THEN** the waveform centres on that annotation and the entry is highlighted

