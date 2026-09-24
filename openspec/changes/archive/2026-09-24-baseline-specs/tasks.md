## 1. Validate

- [x] 1.1 Run `openspec validate baseline-specs --strict` and fix any errors
- [x] 1.2 Confirm every requirement has at least one scenario and every spec has a Purpose

## 2. Verify against the code

- [x] 2.1 `devices`: check against `crates/logic-core/src/devices/` and firmware folders in `src/main/index.ts`
- [x] 2.2 `acquisition`: check against `crates/logic-core/src/engine.rs`, `capture.rs` and FX2 error paths
- [x] 2.3 `trigger`: check against `crates/logic-core/src/trigger.rs` and the trigger UI in `TopBar.tsx`, `Waveform.tsx`, `actions.ts`
- [x] 2.4 `decoders`: check against `crates/logic-core/src/decoders/`, `actions.ts` and `RightPanel.tsx`
- [x] 2.5 `capture-files`: check against `crates/logic-core/src/formats.rs` and file actions in `actions.ts` and `src/main/index.ts`
- [x] 2.6 `waveform-view`: check against `Waveform.tsx`, `Overview.tsx`, `draw.ts`, `layout.ts`, `RightPanel.tsx`, `App.tsx`
- [x] 2.7 `app-shell`: check against `src/main/index.ts`, `src/preload/index.ts`, `App.tsx`, `TopBar.tsx`, `StatusBar.tsx`
- [x] 2.8 Run `npm test` and confirm the existing Rust tests still pass (no code changed)

## 3. Record follow-ups

- [x] 3.1 Keep the Follow-ups list in `design.md` so it can be filed as issues once the backlog board exists

## 4. Archive

- [x] 4.1 Run `openspec archive baseline-specs` and confirm `openspec/specs/` contains all seven capabilities with no `TBD` Purpose placeholders
