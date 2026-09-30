# Proposal

## Why

Delivers #88. The only way to get rid of the trace on screen is to press Start, which discards it and immediately starts a new capture. There is no way to clear the trace on its own, for example to get back to a blank view before wiring up the next circuit. The maintainer asked for a subtle button near Start that asks for confirmation.

## What Changes

- Add a Clear button next to the Start button in the top bar. It is an icon-only ghost button, like the open-file button, so it is less prominent than Start.
- Pressing it opens a confirmation dialog ("Clear the capture?", buttons Clear and Cancel, Cancel is the default). Clear discards the captured samples. Cancel leaves everything as it was.
- After a clear the app looks like it did before the first capture: the waveform shows the "No capture yet" empty state, the status bar shows Ready with no sample count, and markers, measurements and decoder annotations are gone. Capture settings, channel settings and the configured decoders are kept.
- The button is disabled while a capture is in progress and when there is nothing to clear.
- The engine gets a clear operation that replaces the capture with an empty one and returns to the `idle` state. The UI's engine bridge allows it.

### Non-goals

- A menu item or keyboard shortcut for Clear. They can follow if wanted.
- Undo, or warning that the capture hasn't been saved. The app doesn't track unsaved captures.
- Clearing while a capture runs. Stop first.
- Changing what Start does. It still replaces the current capture as before.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `acquisition`: adds a "Clear a capture" requirement. The `idle` state now means "nothing captured since launch or since the last clear".
- `app-shell`: the top bar gains the Clear button and its confirmation. The engine bridge allow-list gains `clear`, and asking for confirmation is its own dedicated call. The empty state also appears after a clear.

## Impact

- `crates/logic-core/src/engine.rs`: new `clear()` that replaces the capture with an empty one, bumps the capture id and sets the state to `idle`. It is ignored while busy. Rust unit tests cover it.
- `crates/logic-node/src/lib.rs`: exposes `clear` over N-API.
- `src/main/index.ts` and `src/preload/index.ts`: add `clear` to the allow-list, plus a dedicated `confirmClear` IPC that shows a native message box.
- `src/renderer/src/api.ts`, `actions.ts`: `engine.clear`, `bridge.confirmClear`, and a `clearCapture()` action that resets markers, measurement and the view.
- `src/renderer/src/components/TopBar.tsx`: the Clear button.
- `scripts/checks/`: a new UI check for clearing on the demo device.
