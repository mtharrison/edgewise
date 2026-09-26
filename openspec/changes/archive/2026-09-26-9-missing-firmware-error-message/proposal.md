# Proposal

## Why

Delivers #9. When a capture starts on a bare FX2 board and its firmware file can't be found, the error tells the user to "see Settings", but Edgewise has no Settings screen; firmware folders are reached through File → Open Firmware Folder. This belongs to the Devices epic (Epic #1). It was found while writing the baseline specs.

Rewording the error isn't enough. The error shows up in a status-bar notification that is cut off at half the window width and disappears after 4 seconds, so the instructions are never read in full (seen in review on PR #53). The engine already knows the file is missing when it lists devices, so the app can ask for the firmware before the capture starts instead of failing afterwards.

## What Changes

- The device entry for a bare board SHALL report the missing firmware file's name in its own field, alongside the existing note.
- Starting a capture on such a board SHALL open a dialog, "Firmware <file> not found", with Choose Folder… and Cancel. Choosing a folder that contains the file copies its `.fw` files into the user firmware folder, re-lists devices and starts the capture. A folder without the file brings the dialog back, naming the folder and the file. Cancel does nothing.
- The engine's own missing-firmware error stays as a fallback for a file removed after the device list, shortened to "Firmware <file> not found." It no longer points to a Settings screen.

### Non-goals

- Changing the device-list note for a bare board ("Needs <file> in a firmware folder").
- Changing which folders are searched for firmware, or the order they are searched in.
- Adding a Settings screen, or changing the File → Open Firmware Folder menu item.
- Remembering the chosen folder as an extra search folder (the files are copied instead).
- Downloading firmware automatically.
- Any other capture or firmware-upload error message.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `devices`: "Firmware readiness note" gains the missing-file field; "Firmware upload" gets the short fallback error; new requirement "Choose firmware folder on start".

## Impact

- `crates/logic-core/src/devices/mod.rs`, `demo.rs`, `fx2lafw.rs`: `DeviceInfo.missing_firmware`, a `readiness()` helper used by `scan()`, the shorter error, unit tests.
- `src/main/index.ts`, `src/preload/index.ts`: new `firmware:missing` call that shows the dialog and folder picker and copies the files.
- `src/renderer/src/actions.ts`, `api.ts`, `types.ts`: `startCapture()` asks for the firmware first; vitest cases in `actions.test.ts`.
- `scripts/checks/firmware-folder.mjs`: UI check with a stubbed bare board and stubbed dialogs.
