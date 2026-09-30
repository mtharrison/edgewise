# Proposal

## Why

Delivers #87. Zooming out currently stops only when the whole capture fills a quarter of the width, and panning allows half a screen of empty space past either end, so the view can show hundreds of milliseconds of nothing (e.g. -200 ms) around the capture. That empty time is never useful; the view should stay close to the data.

## What Changes

- Zooming out SHALL stop when the view shows the whole capture plus 10 ms of empty time before its start and 10 ms after its end.
- Panning SHALL not move the view more than 10 ms past the start or the end of the capture.
- Every way of moving the view (scroll/pinch zoom, `+`/`-`, drag, shift-scroll, arrow keys, overview strip, edge and table navigation, zoom to annotation or burst) obeys the same limits.
- The zoom-in limit (64 pixels per sample) and fit (`F`, Cmd/Ctrl+0, follow mode) are unchanged.

### Non-goals

- Changing the zoom-in limit, zoom step sizes or the pan step of the arrow keys.
- Changing where time 0 is on the ruler (trigger point or capture start).
- Making the 10 ms margin configurable.
- Changing the overview strip's drawing or the shading of time outside the capture.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `waveform-view`: the "Zoom, pan and fit" requirement changes its zoom-out limit from "the whole capture filling a quarter of the width" to "the whole capture plus 10 ms either side", and its pan limit from "half a screen of empty space beyond either end" to "at most 10 ms beyond either end".

## Impact

- `src/renderer/src/view.ts` (`clampViewTo`) and its caller in `src/renderer/src/actions.ts`, which must now pass the sample rate so the margin can be converted from time to samples.
- `src/renderer/src/view.test.ts` unit tests for the new limits.
- A new `scripts/checks/` UI check exercising zoom-out and pan limits on the demo device.
