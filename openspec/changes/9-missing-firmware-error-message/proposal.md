# Proposal

## Why

Delivers #9. When a capture starts on a bare FX2 board and its firmware file can't be found, the error tells the user to "see Settings", but Edgewise has no Settings screen; firmware folders are reached through File → Open Firmware Folder. This belongs to the Devices epic (Epic #1). It was found while writing the baseline specs.

## What Changes

- When a capture fails because the board's firmware file is in none of the firmware folders, the error message SHALL name the missing `.fw` file and tell the user to use File → Open Firmware Folder, instead of pointing to a Settings screen.

### Non-goals

- Changing the device-list note for a bare board ("Needs <file> in a firmware folder").
- Changing which folders are searched for firmware, or the order they are searched in.
- Adding a Settings screen, or changing the File → Open Firmware Folder menu item.
- Any other capture or firmware-upload error message.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `devices`: the "Firmware upload" requirement gains a scenario for a missing firmware file, fixing what the capture error says.

## Impact

- `crates/logic-core/src/devices/fx2lafw.rs`: the missing-firmware error text in firmware upload, plus a unit test.
