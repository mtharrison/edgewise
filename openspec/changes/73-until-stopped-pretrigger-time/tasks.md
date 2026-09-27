# Tasks

## 1. Engine: pre-trigger time with a memory cap

- [x] 1.1 Add a pure `pretrigger_samples(time, samplerate, unit)` in `crates/logic-core/src/trigger.rs` that clamps `time` to 0–1 s and applies a 64 MiB cap, returning the sample count and whether it was capped; add Rust unit tests for 100 ms at 1 MHz and 24 MHz (no cap), 0 s, over 1 s (clamped), and a rate/width that hits the cap
- [x] 1.2 Let `Feeder::new` take the pre-trigger sample count for `limit == 0` instead of the flat 1,000,000, and add a Rust unit test: no limit, 100 ms at a small rate, trigger after more than 100 ms of data, trigger position equals the 100 ms sample count
- [x] 1.3 Add `pretrigger_time` to `StartOptions` (serde default 0.1) and `pretrigger_kept: Option<f64>` to `Status` in `engine.rs`; in `Engine::start`, size the feeder from it when `sample_limit == 0`, clear `pretrigger_kept` on start and set it when a capped capture triggers; add a unit test that `StartOptions` without `pretriggerTime` deserialises to 0.1, and check `npm test` passes (existing `real_sigrok_demo_*` tests included)

## 2. Renderer: separate setting, sent and remembered

- [x] 2.1 Add `pretriggerTime` (default 0.1) to `State` in `store.ts` and to the engine `start` options and `Status` type (`pretriggerKept`) in `api.ts`; pass it in `startCapture` (`actions.ts`); verify `npm run typecheck` passes
- [x] 2.2 Save and restore `pretriggerTime` in `settings.ts` (`toSaved`/`parseSaved`, falling back to 0.1 outside 0–1), restore it in `restoreSettings` and reset it in `resetSettings`; extend `settings.test.ts` (round trip, out-of-range fallback, missing field) and `actions.test.ts` (restore, reset to 0.1, `startCapture` sends both values)
- [x] 2.3 In `pollStatus`, toast "Kept <time> before the trigger (memory limit)" once per capture id when `pretriggerKept` is set; add an `actions.test.ts` case that it toasts once and not again on the next poll

## 3. Slider in time for "Until stopped"

- [ ] 3.1 In `TopBar.tsx`, bind the Pre-trigger slider to `pretrigger` (0–0.9, 5% steps, "%" label) when `duration > 0` and to `pretriggerTime` (0–1 s, 10 ms steps, `fmtTime` label) when `duration === 0`; verify `npm run typecheck` passes
- [ ] 3.2 Add `scripts/checks/pretrigger-until-stopped.mjs` and run it with `node scripts/ui.mjs`: with defaults, 100 ms shows "10%" and "Until stopped" shows "100 ms" with max 1 s; set 30% at 1 s, switch to "Until stopped" and set 500 ms, switch back and see 30%, switch again and see 500 ms; `shot` the popover in "Until stopped"; Read the screenshots
- [ ] 3.3 In the same check, run a triggered "Until stopped" capture on the demo device, stop it, and confirm the trigger position matches the pre-trigger time at the demo's rate; re-run `scripts/checks/remember-settings.mjs` and update it if it no longer passes
- [ ] 3.4 Extend the check (or `remember-settings.mjs`) to set a 250 ms "Until stopped" pre-trigger, reload, and see 250 ms; then Reset Capture Settings and see 100 ms

## 4. Verify and archive

- [ ] 4.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 4.2 Not checkable without a fast board: the memory-cap message on real hardware (covered by unit tests in 1.1 and 2.3); list it under **Not verified** in the PR
- [ ] 4.3 Run the `openspec-verify-change` skill against `73-until-stopped-pretrigger-time` and resolve anything it flags
- [ ] 4.4 Run the `openspec-archive-change` skill to archive the change and merge the deltas into `openspec/specs/trigger`, `acquisition` and `app-shell`
