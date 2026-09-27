# Tasks

## 1. Engine: one FX2 entry, captured either way

- [ ] 1.1 Remove `fx2lafw` from `ALLOWED` in `crates/logic-core/src/devices/sigrok.rs` and update the module doc comment (no more firmware upload during scans); flip `allow_list_has_fx2lafw_but_never_demo_by_default` so it asserts `fx2lafw` is absent by default and still addable through the extra list; verify `cargo test -p logic-core` passes
- [ ] 1.2 Add `sigrok: bool` to `DeviceInfo` (serialised `sigrok`), false for demo and sigrok-scan entries; pass the cached `Option<sigrok::Cli>` into `devices::list` and set it on FX2 entries when the CLI reports `fx2lafw`; add unit tests that build the FX2 flag from a `Cli` with and without `fx2lafw` and verify the demo entry is always false
- [ ] 1.3 Add `env: Vec<(String, String)>` to `SigrokDevice`, applied to the spawned `sigrok-cli`; add a stub-script test (`sigrok::tests::stub`) that echoes an env var to stderr and exits, and verify the capture error is that line
- [ ] 1.4 Add `fx2lafw::usb_address(id)` returning the board's current bus number and device address, and `fx2lafw::sigrok_device(id, cli, fw_dirs)` building a `SigrokDevice` with spec `fx2lafw:conn=<bus>.<address>`, channels `D0…D7`/`D0…D15` from the profile, unit 1/2, the native `DeviceInfo`, and `SIGROK_FIRMWARE_DIR` set to the folder holding the profile's firmware (unset when none has it); unit-test the pure part (spec, channels, unit, env from a given bus/address/profile/folders)
- [ ] 1.5 Add `via` (`native` default, `sigrok`) to `StartOptions`; make `devices::open` take it, open FX2 through `sigrok_device` for `sigrok`, and fail with "<device name> can't be captured through sigrok-cli" for any entry whose `sigrok` flag is false; add engine tests: `via: sigrok` on the demo device fails with "Demo device can't be captured through sigrok-cli", and omitting `via` on the demo device still captures
- [ ] 1.6 Update the `devices` spec-driven tests that assumed a duplicate FX2 listing (engine tests in `engine.rs`), and verify `npm test` passes

## 2. Main process: remembered sigrok-cli executable

- [ ] 2.1 In `src/main/index.ts`, read `{ sigrokCli }` from `<userData>/settings.json` at startup (missing or unreadable → null) and call `engine.setSigrokPath(process.env.EDGEWISE_SIGROK_CLI || saved || null)`; remove the "Until #58" comment
- [ ] 2.2 Add dedicated IPC handlers `sigrok:choose` (open-file dialog; on pick, save and set the path unless `EDGEWISE_SIGROK_CLI` is set; resolve true, or false on cancel), `sigrok:clear` (save null, set path to env or null) and `sigrok:download` (`shell.openExternal` of the engine status's fixed download URL only); expose them on the preload bridge and in `api.ts`; verify `npm run typecheck` passes and `setSigrokPath` is still absent from `ENGINE_METHODS`

## 3. Renderer: Hardware section and driver choice

- [ ] 3.1 Add `sigrok: boolean` to `DeviceInfo` in `types.ts`; add `sigrokStatus` and `via` to the store; fetch `sigrokStatus` after every full scan in `refreshDevices`
- [ ] 3.2 Add the per-model driver map (`localStorage['edgewise.drivers']`, `"<vid>:<pid>" → "sigrok"`) with load/save helpers in `settings.ts`, factoring `fx2Model(id)` out of `sameFx2Model`; derive `via` on selection and refresh (`sigrok` only when the map says so and `device.sigrok`), and pass it from `startCapture`; add vitest cases: default Native, remembered per model across a different port, other model unaffected, falls back to native when `device.sigrok` is false, unreadable map ignored, Reset Capture Settings leaves the map alone
- [ ] 3.3 Add the Native / sigrok-cli control after the device picker in `TopBar.tsx`, shown only when the selected device has `sigrok`, disabled while capturing; add a vitest case that `startCapture` sends `via: 'sigrok'` when chosen
- [ ] 3.4 Add the Hardware section at the top of `RightPanel.tsx`: path and version or "Not found" with a download link (`sigrok:download`), scanning state, Choose… and "Use automatic search" (shown once a path is chosen), buttons disabled while scanning or capturing; Choose/clear trigger `refreshDevices({ rescan: true })`
- [ ] 3.5 Add `scripts/checks/sigrok-hardware.mjs`: with `EDGEWISE_SIGROK_CLI=/nonexistent`, check "Not found" and the link; stub `dialog.showOpenDialog` through `app.evaluate` to return a stub `sigrok-cli` script, press Choose…, check its path and version are shown, reload and check they persist; press "Use automatic search" and check the section updates; check no driver choice is shown on the demo device; then wrap the main-process `engine` IPC handler through `app.evaluate` to add a fake FX2 entry with `sigrok: true`, select it, check the choice shows Native, pick sigrok-cli, press Start and check the recorded start options have `via: 'sigrok'`, reload and check sigrok-cli is still chosen. Run it with `node scripts/ui.mjs` and read the screenshots
- [ ] 3.6 Re-run `scripts/checks/no-sigrok.mjs`, `sigrok-demo.mjs` and `remember-settings.mjs` and verify they still pass

## 4. Hardware check and docs

- [ ] 4.1 Rewrite `scripts/checks/sigrok-fx2.mjs` for a real board: the board is listed once, the choice is shown, a 100 ms capture at 1 MHz through sigrok-cli ends with 100k samples, the device id is unchanged afterwards, and after unplug/replug the board is reselected with sigrok-cli still chosen; list it under **Not verified** in the PR (needs a board)
- [ ] 4.2 Update README's sigrok-cli paragraph (Hardware section, driver choice, no duplicate FX2 entry, `EDGEWISE_SIGROK_CLI` precedence) and verify it matches the specs

## 5. Verify and archive

- [ ] 5.1 Run `npm test`, `npm run typecheck` and `npx openspec validate --all --strict` and confirm all pass
- [ ] 5.2 Run the `openspec-verify-change` skill against `58-native-or-sigrok-driver-choice` and resolve anything it flags
- [ ] 5.3 Run the `openspec-archive-change` skill to archive the change and update `openspec/specs/app-shell/spec.md` and `openspec/specs/devices/spec.md`
