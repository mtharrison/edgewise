## 1. Test setup

- [x] 1.1 Add Vitest as a dev dependency and change `npm test` to run the Rust tests then `vitest run`
- [x] 1.2 Confirm CI still passes with the new test step

## 2. View maths

- [x] 2.1 Create `src/renderer/src/view.ts` with `clampViewTo`, moved unchanged from `clampView` in `actions.ts`; keep `clampView` as a wrapper
- [x] 2.2 Add `frameRange(start, end, plotWidth)` (range centred, spanning 90% of the width)
- [x] 2.3 Add `annotationAt(anns, sample, tolerance)` returning the annotation (or merged block) covering the sample, or null
- [x] 2.4 Tests for `clampViewTo` (existing limits unchanged), `frameRange` (centring, 90% span, clamp at 64 px/sample for a 1-sample range) and `annotationAt` (hit, miss, tolerance edge, dense block)

## 3. Interaction

- [x] 3.1 Add `frameAnnotation(start, end)` in `actions.ts`: set the clamped view and turn follow off
- [x] 3.2 In `Waveform.tsx`, track the platform modifier from pointer events and window `keydown`/`keyup`, clear it on `blur`, and keep the highlighted annotation (decoder, row, start, end) in state
- [x] 3.3 On modified pointer-down over a decoder row: frame the annotation under the pointer if there is one; never start a pan or select a table row
- [x] 3.4 Draw the highlighted annotation with a brighter outline and fill in `draw.ts`; show a pointer cursor over it
- [x] 3.5 Add "⌘ click zoom to packet" (Ctrl on other platforms) to the status bar hints

## 4. Verify and archive

- [x] 4.1 `npm test` and `npm run typecheck` pass
- [x] 4.2 By hand with the demo device: every scenario in the spec delta, including zoomed-out burst framing and highlight on key press without moving
- [x] 4.3 Run `/opsx:verify`, then archive the change in this PR
