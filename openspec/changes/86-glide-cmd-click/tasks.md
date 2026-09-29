# Tasks

## 1. Zoom-and-pan path

- [ ] 1.1 Bring `viewPath` from `prototype/86-glide-cmd-click` (80b1f92) into `src/renderer/src/view.ts` and verify `npm run typecheck` passes
- [ ] 1.2 Bring over its `viewPath` tests in `src/renderer/src/view.test.ts` (ends match, pure zoom about a shared centre, zoom-out on a long pan, zero length for identical views), add one for a combined pan and zoom (e.g. `spp` 2000 → 0.5 far away) whose midpoint `spp` is above both ends, and verify `npm test` passes

## 2. Glide on Cmd/Ctrl+click

- [ ] 2.1 Add `glideTo` in `src/renderer/src/actions.ts` as in the prototype: requestAnimationFrame loop, duration scaled by path length and capped at 480 ms, ease-out, final frame writes the exact clamped target, stops if the store's view is no longer the one it last set, and cancels any previous glide. Verify `npm run typecheck` passes
- [ ] 2.2 Make `frameSpan` set `follow: false` and glide to the clamped framed view, jumping in one step when `prefers-reduced-motion: reduce` matches or the path length is zero or not finite. Confirm with `grep -n frameSpan src/renderer/src` that the only callers are the Cmd/Ctrl+click handlers in `Waveform.tsx`, and that `centerOn`, `zoomAt`, `panBy` and fit are unchanged

## 3. UI check

- [ ] 3.1 Add `scripts/checks/cmd-click-glide.mjs` from the prototype. Verify with `node scripts/ui.mjs scripts/checks/cmd-click-glide.mjs` that Cmd/Ctrl+click on a decoded packet passes through several time/div values, that `F` changes in one step, and that under `emulateMedia({ reducedMotion: 'reduce' })` it jumps in one step to the same final time/div as the glide. It records `cmd-click-glide.gif` and `cmd-click-glide-after.png` for the PR
- [ ] 3.2 Extend the check for "User input takes over": start a glide, press `-` (or scroll) after a couple of frames, and assert that after that frame the time/div changes only from the keypress, with no further glide frames
- [ ] 3.3 Extend the check for "Second Cmd+click during a glide": Cmd+click a second packet mid-glide and assert the view ends framing the second packet
- [ ] 3.4 Extend the check for "Glide into a burst": Cmd+click a burst on a channel row with no decoder and assert it passes through intermediate time/div values
- [ ] 3.5 Extend the check for "Other view changes stay instant": clicking a decoded-data table row, clicking the overview strip, and pressing `+`/`-` each change time/div in at most one step (edge jumps use the same instant `centerOn` path as table rows)
- [ ] 3.6 Run the whole check with `node scripts/ui.mjs scripts/checks/cmd-click-glide.mjs`, verify it passes, and Read the saved screenshot and GIF

## 4. Verify and archive

- [ ] 4.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 4.2 Run the `openspec-verify-change` skill against `86-glide-cmd-click` and resolve anything it flags
- [ ] 4.3 Run the `openspec-archive-change` skill to archive the change and update `openspec/specs/waveform-view/spec.md`
