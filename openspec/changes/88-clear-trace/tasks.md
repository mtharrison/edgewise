# Tasks

## 1. Engine clear

- [x] 1.1 Add `Engine::clear()` in `crates/logic-core/src/engine.rs`. While busy it does nothing. Otherwise it swaps in an empty capture through `replace_capture()` and sets the state to `Idle` with no message and no `pretrigger_kept`. Add Rust unit tests for: a `done` capture from the demo device clears to `idle` with 0 samples and a higher capture id; an `error` state clears to `idle` with an empty message; clearing during a running "Until stopped" demo capture changes nothing. Verify with `npm test`
- [x] 1.2 Expose `clear` in `crates/logic-node/src/lib.rs` and verify the binding builds (`npm run build`)

## 2. Bridge and action

- [ ] 2.1 Add `clear` to `ENGINE_METHODS` and a `clear:confirm` IPC handler in `src/main/index.ts` that shows the "Clear the capture?" message box (Clear / Cancel, Cancel default) and resolves true only for Clear. Expose it as `bridge.confirmClear` in `src/preload/index.ts` and `src/renderer/src/api.ts`, add `engine.clear`, and verify with `npm run typecheck`
- [ ] 2.2 Add `clearCapture()` to `src/renderer/src/actions.ts`. It ignores the request when busy or when there are 0 samples, asks `bridge.confirmClear()`, then calls `engine.clear()`, resets markers, measurement and hover, and polls status. Add `actions.test.ts` cases for: confirmed clear calls `engine.clear` and resets markers; cancel doesn't call `engine.clear`; busy or empty doesn't open the dialog. Verify with `npm test`

## 3. Top bar button

- [ ] 3.1 Add the Clear button (ghost icon button, `Trash2`, title "Clear capture") just before the capture button in `TopBar.tsx`, disabled while busy or when there are 0 samples, and wired to `clearCapture`. Verify with `npm run typecheck`
- [ ] 3.2 Add `scripts/checks/clear-capture.mjs`. It stubs `dialog.showMessageBox`, then: on the demo device, checks Clear is disabled at launch; captures, adds a UART decoder and drops a marker; presses Clear and chooses Cancel, and checks the samples and marker are still there; presses Clear and chooses Clear, and checks "No capture yet" shows, the status bar reads Ready with no sample count, the decoder is still listed with no annotations, and no capture started. It also checks the dialog's message and buttons. Take `shot('clear-button')` of the top bar with a capture shown, and `rec('clear-capture')` of the confirmed clear. Run it with `node scripts/ui.mjs scripts/checks/clear-capture.mjs` and Read the screenshots

## 4. Verify and archive

- [ ] 4.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 4.2 Run the `openspec-verify-change` skill against `88-clear-trace` and resolve anything it flags
- [ ] 4.3 Run the `openspec-archive-change` skill to archive the change and merge the deltas into `openspec/specs/acquisition/spec.md` and `openspec/specs/app-shell/spec.md`
