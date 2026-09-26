# Design

## Context

The missing-firmware error is built inline in `Fx2::upload_firmware` (`crates/logic-core/src/devices/fx2lafw.rs`), which only runs with a bare board attached, so the text can't be unit-tested as it stands. File → Open Firmware Folder (`src/main/index.ts`) opens the app's user firmware folder, which is the first folder searched.

## Goals / Non-Goals

**Goals:**
- Make the error point to a place that exists, and cover its text with a test that needs no hardware.

**Non-Goals:**
- See proposal.md, Non-goals.

## Decisions

- **Build the message in a small helper** (`missing_firmware_message(file)`) called from `upload_firmware`, and unit-test the helper. Alternative: fake a device to reach `upload_firmware` in a test; that needs a USB abstraction the crate doesn't have, which is far more than this fix calls for.
- **Keep the rest of the message.** "Download sigrok-firmware-fx2lafw and copy the .fw files into …" stays; only the destination changes to "the folder opened by File → Open Firmware Folder". Naming the menu item, rather than a filesystem path, works the same on every platform.

## Risks / Trade-offs

- [The path to the error needs a real bare board, so the end-to-end message can't be checked in CI] → The unit test pins the text; the maintainer checks it once with a board.
- [The menu label and the message could drift apart] → The spec names both; a later rename of the menu item would have to change the spec too.

## Follow-up candidates

- The device-list note "Needs <file> in a firmware folder" doesn't say where firmware folders are either. Left alone here (not in the issue's requirements); worth its own issue.
