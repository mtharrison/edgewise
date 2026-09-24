## Why

Delivers #29 (epic: Waveform view, capability `waveform-view`).

#21 lets the user Cmd/Ctrl+click a decoder annotation to frame it. A channel with no decoder has no annotations, so framing a burst of raw data still takes scroll-zooming and drag-panning. The same one-click framing should work on raw channel rows.

## What Changes

- Holding Cmd (macOS) or Ctrl (Windows and Linux) over a channel row highlights the burst under the pointer. A burst is a run of transitions whose gaps are all shorter than an idle threshold.
- The idle threshold is a few pixels at the current zoom, so a burst is what looks like one solid block on screen. Framing a burst and Cmd/Ctrl+clicking again refines it into smaller bursts, like merged annotation blocks in #21.
- Cmd/Ctrl+click on a burst frames it with the same margin as annotation framing, and turns follow mode off.
- Cmd/Ctrl+click on an idle stretch does nothing. A modified click on a channel row never starts a pan.
- Decoder rows keep the #21 behaviour.

**Non-goals:**
- A user-adjustable idle threshold, or one expressed in time rather than pixels.
- Bursts across several channels at once (for example, a whole parallel bus). Each channel row finds its own bursts.
- Changing the hover pulse tooltip or plain click on channel rows.
- Animating the zoom.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `waveform-view`: adds a requirement for framing a burst on a channel row with Cmd/Ctrl+click.

## Impact

- `crates/logic-core/src/capture.rs`: burst search over the capture's summary tree, with unit tests.
- `crates/logic-node/src/lib.rs`, `src/main/index.ts`, `src/renderer/src/api.ts`: a new `burstAt` engine call.
- `src/renderer/src/components/Waveform.tsx` (hit test and click on channel rows), `draw.ts` (burst highlight), `actions.ts` (framing action shared with annotations).
