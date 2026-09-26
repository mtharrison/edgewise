# Tasks

## 1. Saved settings module

- [x] 1.1 Add `src/renderer/src/settings.ts` with `toSaved(state)` (device id, sample rate, duration, pre-trigger, per-channel name/colour/visible/trigger, per-decoder config/visible, `version: 1`), `parseSaved(text)` (returns `null` for missing, malformed or unknown-version data; replaces an out-of-range duration or pre-trigger with the default; drops decoders of unknown kind and merges known ones over `DECODER_DEFAULTS`), and `load()`/`save()` over `localStorage` key `edgewise.settings`; verify with `npm run typecheck`
- [x] 1.2 Add `fitToDevice(saved, devices)` in the same module: picks the remembered device (exact id, or same FX2 model) or the first listed, keeps the sample rate only if supported (else the device default), overlays channel settings onto `makeChannels(dev.channels)` by index, and keeps only decoders whose `decoderChannels` are all below the channel count; verify with `npm run typecheck`
- [x] 1.3 Add `settings.test.ts` covering: round trip of every remembered field; unreadable/unknown-version text → `null`; invalid duration and pre-trigger → defaults; remembered device present / same FX2 model on another port / absent → first device; unsupported sample rate → device default; 16 remembered channels onto an 8-channel device keeps D0–D7 and drops a decoder on D12; verify `npm test` passes

## 2. Restore and save in the app

- [ ] 2.1 In `actions.ts`, add `restoreSettings(saved)` that applies duration and pre-trigger, and make the first `refreshDevices()` after start-up use `fitToDevice` to set device, sample rate and channels, then re-create decoders in parallel with `engine.addDecoder`/`engine.decoderRows` (skipping any the engine rejects, no toast); later refreshes keep the existing behaviour; extend `actions.test.ts` (mock `addDecoder`/`decoderRows`) to check the first refresh restores device, rate, channels and decoders, and a later refresh does not; verify `npm test` passes
- [ ] 2.2 Make the channel-count rebuild in `pollStatus` overlay the current channels' settings by index instead of using default names only, and add a test that a restored 8-channel name list survives a status poll reporting the same count and keeps D0–D7 names when the count grows to 16; verify `npm test` passes
- [ ] 2.3 In `App.tsx`, load saved settings before the first device refresh, and once restore has finished subscribe to the store and call `save()` when `toSaved` output changes; verify with `npm run typecheck` and `npm test`
- [ ] 2.4 Write `scripts/checks/remember-settings.mjs`: with the demo device, set 1 s duration, 30% pre-trigger, rename D0 to "TX", hide D7, set a rising trigger on D2, add a UART decoder and set 9600 baud; `page.reload()`; check every value came back and screenshot it; then open a `.sr` file saved from the demo capture with different channel names and check the labels show the file's names. Run `node scripts/ui.mjs scripts/checks/remember-settings.mjs` and Read the screenshots

## 3. Reset capture settings

- [ ] 3.1 In `src/main/index.ts`, add Capture → Reset Capture Settings (after Zoom to Fit) sending `reset`; verify with `npm run typecheck`
- [ ] 3.2 Add `resetSettings()` in `actions.ts`: ignored while `isBusy(status)`; otherwise removes all decoders from the engine, restores default duration and pre-trigger, selects the first listed device with 20 MHz kept if supported, and resets channels with `makeChannels`; wire `reset` in `App.tsx`'s menu handler; add a test in `actions.test.ts` that customised settings return to defaults, the capture status is untouched, and nothing happens while a capture is running; verify `npm test` passes
- [ ] 3.3 Extend `scripts/checks/remember-settings.mjs` to trigger the reset (via `app.evaluate` clicking the Capture menu item), check names are `D0…`, no trigger, no decoders and 100 ms duration, `page.reload()` and check the defaults are still shown, and confirm the Capture menu lists Start / Stop, Zoom to Fit and Reset Capture Settings. Run it and Read the screenshots

## 4. Verify and archive

- [ ] 4.1 Run `npm test`, `npm run typecheck` and `npx openspec validate --all --strict`; all pass
- [ ] 4.2 Run `openspec-verify-change` for `34-remember-capture-settings` and fix what it finds. List under "Not verified" in the PR: restoring a real FX2 board after restart, and falling back to the demo device when that board is unplugged (needs hardware)
- [ ] 4.3 Archive the change with `openspec-archive-change` so the `app-shell` deltas land in `openspec/specs/`, and verify `npx openspec validate --all --strict` still passes
