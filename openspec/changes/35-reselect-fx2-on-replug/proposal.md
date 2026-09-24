# Proposal

## Why

Delivers #35. Every 3-second device rescan replaces a vanished selection with the first device in the new list, which is always the demo device. Unplugging the selected FX2 board therefore makes Edgewise silently switch to the demo device, and a capture started moments later runs against synthetic data instead of failing loudly or waiting for the board to come back. This belongs to the Devices epic (Epic #1).

## What Changes

- On device refresh, if the selected device disappears, keep it selected (instead of falling back to the first listed device) and mark it disconnected.
- While the selected FX2 board is disconnected, the device picker SHALL show it as disconnected, its sample-rate and duration pickers SHALL keep showing its current values, and Start SHALL be disabled with a message that the device isn't connected.
- When a board of the same USB vendor/product id reappears (on any port) while it is still selected, it SHALL be selected again automatically, keeping the current sample rate if supported.
- Picking a different device while the selected one is disconnected SHALL replace the selection as normal; the disconnected board SHALL NOT be reselected once the user has chosen something else.

### Non-goals

- Reselecting a board that was manually deselected before it was unplugged.
- Distinguishing between two boards of the same model plugged in at once (matched by vendor/product id, not by port).
- Any change to how devices are discovered, enumerated or firmware-uploaded (`crates/logic-core`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `app-shell`: the device-refresh requirement changes from "if the selected device disappears, the first listed device is selected" to "if it disappears, keep it selected and show it disconnected; reselect it if the same model reappears; a manual reselection while it is disconnected wins." The top-bar requirement gains that Start must be disabled with an explanation while the selected device is disconnected.

## Impact

- `src/renderer/src/actions.ts` (`refreshDevices`): stop replacing a vanished selection with `devices[0]`; track disconnection and match reappearance by vendor/product id rather than exact device id (FX2 device ids encode the USB port, which can change between unplug and replug).
- `src/renderer/src/store.ts`: state needs to represent "selected device is disconnected" so the UI can render it.
- `src/renderer/src/components/TopBar.tsx`: device picker shows the disconnected state; Start is disabled with an explanation.
- `src/renderer/src/actions.ts` (`startCapture`): reject starting a capture on a disconnected device with an explanatory message.
