# Design

## Context

The missing-firmware error is built in `Fx2::upload_firmware` (`crates/logic-core/src/devices/fx2lafw.rs`), which only runs with a bare board attached. When the capture fails, the renderer shows the status message as a toast (`pollStatus()` in `src/renderer/src/actions.ts`), which is cut off at `max-width: 50vw` and hides after 4 s. `scan()` in the same file already checks whether the `.fw` file exists and turns the answer into the note "Needs <file> in a firmware folder". File → Open Firmware Folder (`src/main/index.ts`) opens the app's user firmware folder, which is the first folder searched.

## Goals / Non-Goals

**Goals:**
- Never send the user to a place that doesn't exist, and let them fix a missing firmware file without leaving the app.
- Test the logic without hardware.

**Non-Goals:**
- See proposal.md, Non-goals.

## Decisions

- **Check before Start, not after it fails.** `scan()` already knows, so `DeviceInfo` gets `missing_firmware: Option<String>` (`missingFirmware` in JS) and `startCapture()` checks it before calling `engine.start`. Alternative: keep failing in the engine and show a dialog on that error; that means matching error text and still starts a doomed capture.
- **A separate field, not parsing the note.** The note is display text; the renderer shouldn't depend on its wording. The note and the field come from one `readiness()` helper so they can't disagree, and the helper is unit-tested with a temporary folder.
- **Native dialog in main.** A new `firmware:missing` IPC runs `dialog.showMessageBox` (Choose Folder…, Cancel), then `showOpenDialog({ properties: ['openDirectory'] })`. If the chosen folder lacks the file, it loops back to the message box with a detail line naming the folder and file. It resolves `true` once files are copied, `false` on cancel. Keeping it all in main follows the existing pattern for file dialogs and means the renderer makes one call.
- **Copy the files rather than remember the folder.** Every `.fw` in the chosen folder is copied into the user firmware folder and `engine.setFirmwareDirs()` runs again. Nothing new is saved, and the next launch finds the file in the folder File → Open Firmware Folder opens. Copying all `.fw` files (not only the one needed) covers other board models from the same firmware package.
- **Keep a short engine error.** If the file vanishes between listing and Start, the engine still fails, now with "Firmware <file> not found." The long instructions live in the dialog, where there's room.

## Risks / Trade-offs

- [The end-to-end flow needs a real bare board] → The UI check stubs a bare board and the dialogs in the main process; `readiness()` and `startCapture()` have unit tests. The maintainer checks it once with a board.
- [A `.fw` file with the same name in the user firmware folder is overwritten] → That folder is only for firmware; replacing a file with the one the user just chose is what they asked for.
- [The toast still truncates other long errors] → Out of scope; worth its own issue.

## Follow-up candidates

- The device-list note "Needs <file> in a firmware folder" doesn't say where firmware folders are.
- The status-bar toast truncates long messages with no way to read the rest.
