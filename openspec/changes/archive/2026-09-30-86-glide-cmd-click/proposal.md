# Proposal

## Why

Delivers #86. Cmd/Ctrl+click on a decoded packet or a channel burst frames it, but the view jumps there in a single frame. After a big zoom it is hard to tell where you landed or how it relates to what you were looking at. Animating the jump as one smooth zoom-and-pan keeps the user oriented.

## What Changes

- Cmd/Ctrl+click on an annotation or a burst SHALL move the view to its framed position along a smooth zoom-and-pan path over a fraction of a second (roughly 180–480 ms, longer for longer moves, easing out), zooming out on the way when the target is far off-screen. The final view SHALL be exactly the one the instant jump gives today.
- Any scroll, drag, zoom or other view change during the move SHALL take over at once from wherever the view is.
- With the OS "reduce motion" setting on, Cmd/Ctrl+click SHALL jump instantly, as today.
- Every other view change stays instant.

### Non-goals

- Animating any other view change: `F`/Cmd+0 fit, decoded-data table row clicks, overview strip clicks, edge navigation, `+`/`-` keys, scroll/pinch zoom, dragging, or follow mode during a live capture.
- A user setting to turn the animation off or tune its speed, beyond honouring the OS reduce-motion setting.
- Changing which span is framed, the framing margin, or the zoom limits.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `waveform-view`: adds a requirement that Cmd/Ctrl+click framing (from "Zoom to an annotation" and "Zoom to a burst") glides to its target, yields to user input, honours reduce motion, and that other view changes stay instant.

## Impact

- `src/renderer/src/view.ts`: a pure zoom-and-pan path function (van Wijk & Nuij), unit-tested in `view.test.ts`.
- `src/renderer/src/actions.ts` (`frameSpan`): animate to the framed view instead of setting it in one step. `frameSpan` is only called from the Cmd/Ctrl+click handlers in `Waveform.tsx`, so no other view change is affected.
- `scripts/checks/cmd-click-glide.mjs`: new UI check that also records a GIF for the PR.
- Starting point: the prototype on branch `prototype/86-glide-cmd-click` (commit 80b1f92), which implements this and whose check passes.
