# Design

## Context

See proposal.md for why. Today the renderer stores one `pretrigger` fraction (`store.ts`, persisted in `settings.ts`, default 0.1, valid 0–0.9) and always sends it to `engine.start`. `Feeder::new` in `crates/logic-core/src/trigger.rs` sizes the pre-trigger ring as `limit * pre` samples, or a flat 1,000,000 samples when `limit == 0`, so the slider has no effect in "Until stopped". The feeder does not know the sample rate; `Engine::start` does (`opts.samplerate`), along with the sample width in bytes (`unit`, 1 or 2).

The engine's `Status.message` is already used for progress text from sigrok-cli and for error text, and the renderer only toasts it when a capture ends in `error`.

## Goals / Non-Goals

**Goals:**
- One place in the engine turns (time, sample rate, sample width) into a ring size and applies the memory cap, so the cap and the "kept" figure always agree.
- The renderer can tell the user exactly how much pre-trigger time the cap left them with.

**Non-Goals:**
- Reworking the ring buffer's data structure or chunk handling.
- Capping memory used after the trigger.

## Decisions

### A separate `pretriggerTime` setting, not a reinterpretation of `pretrigger`
Add `pretriggerTime` (seconds, default 0.1, valid 0–1) to the store, the saved settings and `StartOptions` (`#[serde(default = ...)]` of 0.1). `pretrigger` keeps its meaning and range. The slider in `TopBar.tsx` binds to `pretrigger` when `duration > 0` and to `pretriggerTime` when `duration === 0`, which gives each mode its own value for free.
*Alternative:* keep one number and convert it when the duration changes. Rejected: the issue asks for each mode to keep its own setting, and a conversion between a fraction and a time depends on the duration, which "Until stopped" does not have.

The renderer sends both values on every start; the engine picks one from `sample_limit`. This keeps `startCapture` free of mode logic and makes the engine default match the UI default when the field is missing (older callers, tests).

### Size the ring in the engine, pass samples to the feeder
`Engine::start` computes the pre-trigger sample count and passes it to `Feeder::new` in place of the fraction when `sample_limit == 0`. A small pure function, e.g. `pretrigger_samples(time, samplerate, unit) -> (samples, capped)`, holds the maths and the cap so it can be unit-tested without a device. The timed path (`limit * pre`) is unchanged.

### Memory cap of 64 MiB for the ring
1 s at 24 MHz is 24 MB with 8 channels and 48 MB with 16, so every FX2 rate up to the full 1 s fits. Faster sigrok devices (e.g. SLogic) are where the cap bites. The value is a constant in `trigger.rs`, not a user setting (see proposal Non-goals). The ring already grows to its full size while waiting, so this is also the peak extra memory while armed.

### Report the cut with a dedicated status field
Add `pretriggerKept: Option<f64>` (seconds) to `Status`. It is set when the trigger fires on a capture whose ring was capped, to the time the ring could hold (cap samples / sample rate), and cleared on every new start. `pollStatus` shows a toast such as "Kept 42 ms before the trigger (memory limit)" the first time it sees the field set for a capture id.
*Alternative:* put the text in `Status.message`. Rejected: sigrok-cli progress lines overwrite `message`, and the renderer only toasts it on `error`.

If the trigger fires before the ring has filled, the capture holds less than the cap anyway; that case follows "Fewer samples than the buffer" and does not show the message, because nothing was cut by the cap.

### Slider in time
0 to 1 s in 10 ms steps (101 positions), labelled with the existing `fmtTime` helper so it reads "100 ms", "1 s". The label next to the slider stays "Pre-trigger".

## Risks / Trade-offs

- [The ring now defaults to 100 ms instead of 1,000,000 samples, so at rates under 10 MHz users get less pre-trigger than before] → That is what the slider asks for, and the old amount is reachable by moving it; the default matches the issue.
- [A 64 MiB `VecDeque<u8>` while armed on a fast device] → Bounded and only while waiting; lower than the unbounded growth of the capture after the trigger.
- [`scripts/checks/remember-settings.mjs` reads the first `.popover input[type=range]`] → Still correct with a timed duration; update it if the new check changes its setup.

## Follow-up issue candidates

- An "Until stopped" capture has no memory limit after the trigger fires and can grow until the app runs out of memory. Not fixed here.
