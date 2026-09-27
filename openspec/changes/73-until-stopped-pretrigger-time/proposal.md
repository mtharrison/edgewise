# Proposal

## Why

Delivers #73. With the duration set to "Until stopped" there is no sample limit, so the pre-trigger percentage has nothing to be a percentage of. The engine ignores the slider and always keeps 1,000,000 samples before the trigger. That is 42 ms at 24 MHz and a full second at 1 MHz, and the user is never told. In "Until stopped" the setting should be a time.

## What Changes

- When the duration is "Until stopped", the Pre-trigger slider is shown in time, from 0 to 1 s, with a default of 100 ms. With a timed duration it stays a percentage, as today.
- The app keeps a separate pre-trigger setting for each mode (percentage for timed captures, time for "Until stopped"). Switching duration keeps each mode's value, and both are remembered across restarts and reset by Reset Capture Settings.
- A triggered "Until stopped" capture keeps the slider's time of signal before the trigger at any sample rate, instead of a fixed 1,000,000 samples.
- The pre-trigger buffer has a fixed memory cap. When the chosen time needs more memory than the cap at the current sample rate and channel count, the capture keeps as much as the cap allows and the app says how much time it kept before the trigger.

### Non-goals

- Changing the pre-trigger behaviour of timed captures (range, steps, default and meaning stay as they are).
- Letting the user set the memory cap.
- Limiting how much memory an "Until stopped" capture uses after the trigger fires.
- Changing the waveform view, trigger conditions or the `.sr` file format.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `trigger`: "Pre-trigger retention" changes from a fixed 1,000,000 samples with no limit to the pre-trigger time, capped by memory with a message saying what was kept. "Trigger editing in the UI" gains the time-based slider for "Until stopped" and separate settings per mode.
- `acquisition`: "Start a capture" takes a pre-trigger time for captures that run until stopped, as well as the pre-trigger fraction.
- `app-shell`: "Remembered capture settings" and "Reset capture settings" cover the "Until stopped" pre-trigger time too.

## Impact

- `crates/logic-core/src/trigger.rs` (`Feeder::new`): size the pre-trigger buffer from the time and sample rate when there is no limit, with a memory cap.
- `crates/logic-core/src/engine.rs` (`StartOptions`, `Engine::start`, `Status`): accept the pre-trigger time and report when the cap cut it short.
- `src/renderer/src/store.ts`, `settings.ts`, `actions.ts` (`startCapture`, `pollStatus`, `restoreSettings`, `resetSettings`), `api.ts`: a second pre-trigger setting, sent to the engine, remembered and reset; show the "kept" message.
- `src/renderer/src/components/TopBar.tsx`: the slider switches between percentage and time.
- Tests: Rust unit tests in `trigger.rs`, vitest in `settings.test.ts` / `actions.test.ts`, and a new `scripts/checks/` UI check. `scripts/checks/remember-settings.mjs` may need updating.
