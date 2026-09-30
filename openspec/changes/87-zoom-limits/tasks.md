# Tasks

## 1. View limits

- [x] 1.1 Add a `samplerate` argument to `clampViewTo` in `src/renderer/src/view.ts` and replace the 4× zoom-out cap and half-screen pan bounds with the 10 ms margin rules from design.md (margin 0 when the rate is not positive); update its doc comment. Verify with `npm run typecheck`
- [x] 1.2 Pass `status.samplerate` from `clampView` in `src/renderer/src/actions.ts`. Verify with `npm run typecheck`
- [x] 1.3 Update `src/renderer/src/view.test.ts`: zoom-out stops at capture + 2×10 ms, pan stops 10 ms before the start and 10 ms after the end, zoom-in is still 64 px per sample, an empty capture and a zero sample rate still clamp sensibly. Verify with `npm test`

## 2. UI check

- [x] 2.1 Add `scripts/checks/zoom-limits.mjs`: run a demo capture, zoom out as far as possible and assert the ruler/status bar shows a span of the capture plus 20 ms, pan to each end and assert the view stops 10 ms past it, press `F` and assert the capture fills the width. Save a `shot` of the fully zoomed-out view. Verify with `node scripts/ui.mjs scripts/checks/zoom-limits.mjs` and read the screenshot

## 3. Spec update and archive

- [ ] 3.1 Run `npm test` and `npm run typecheck`, then verify the implementation against the change's specs with openspec-verify-change
- [ ] 3.2 Archive the change with openspec-archive-change and check `openspec/specs/waveform-view/spec.md` has the updated "Zoom, pan and fit" requirement
