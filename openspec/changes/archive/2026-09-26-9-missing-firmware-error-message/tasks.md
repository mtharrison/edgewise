# Tasks

## 1. Engine

- [x] 1.1 In `crates/logic-core/src/devices/mod.rs`, add `missing_firmware: Option<String>` to `DeviceInfo`; set it to `None` for the demo device
- [x] 1.2 In `crates/logic-core/src/devices/fx2lafw.rs`, add `readiness(loaded, fw_dirs, file)` returning the note and missing file, and use it in `scan()`. Unit-test it with a temporary folder
- [x] 1.3 Shorten `missing_firmware_message(file)` to "Firmware <file> not found." and update its unit test. Verify `npm test` passes

## 2. Dialog on Start

- [x] 2.1 In `src/main/index.ts`, add a `firmware:missing` handler: message box (Choose Folder…, Cancel), folder picker, loop back if the file isn't there, otherwise copy the `.fw` files into the user firmware folder and call `engine.setFirmwareDirs()` again. Expose it as `chooseFirmware(file)` in `src/preload/index.ts` and `src/renderer/src/api.ts`
- [x] 2.2 Add `missingFirmware` to `DeviceInfo` in `src/renderer/src/types.ts`. In `startCapture()`, when the selected device has one, call `chooseFirmware`, return on cancel, otherwise `refreshDevices()` and start
- [x] 2.3 Add vitest cases in `actions.test.ts`: choose then start, cancel, and no dialog without missing firmware. Verify `npm test` and `npm run typecheck` pass
- [x] 2.4 Add `scripts/checks/firmware-folder.mjs` that stubs a bare board and the dialogs in main, and checks a wrong folder, Cancel, and a right folder (files copied, capture starts). Verify with `node scripts/ui.mjs scripts/checks/firmware-folder.mjs`
- [ ] 2.5 Maintainer check (needs a real bare FX2 board): with the board's `.fw` file removed from every firmware folder, press Start, choose a folder with the sigrok firmware, and confirm the capture starts

## 3. Verify and archive

- [x] 3.1 Run `npm test`, `npm run typecheck` and `npx openspec validate --all --strict` and confirm they pass
- [x] 3.2 Update `openspec/specs/devices/spec.md` to match the delta
