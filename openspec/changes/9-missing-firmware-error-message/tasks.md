# Tasks

## 1. Fix the missing-firmware error

- [x] 1.1 In `crates/logic-core/src/devices/fx2lafw.rs`, add `missing_firmware_message(file)` returning "Firmware <file> not found. Download sigrok-firmware-fx2lafw and copy the .fw files into the folder opened by File → Open Firmware Folder.", and use it in `upload_firmware`. Verify `npm test` builds
- [x] 1.2 Add a unit test in the same file's `tests` module checking that the message names the given `.fw` file, contains "File → Open Firmware Folder", and does not contain "Settings". Verify `npm test` passes
- [ ] 1.3 Maintainer check (needs a real bare FX2 board): with the board's `.fw` file removed from every firmware folder, start a capture and confirm the status shows the new message

## 2. Verify and archive

- [x] 2.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 2.2 Run the `openspec-verify-change` skill against `9-missing-firmware-error-message` and resolve anything it flags
- [ ] 2.3 Run the `openspec-archive-change` skill to archive the change and update `openspec/specs/devices/spec.md`
