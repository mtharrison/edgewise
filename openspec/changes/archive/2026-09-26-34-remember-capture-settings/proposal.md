# Proposal

## Why

Delivers #34. Every restart resets the device, sample rate, duration, pre-trigger, channel names, colours, trigger and decoders to their defaults. With the same board and wiring each time, the user has to set it all up again after every launch. This belongs to the App shell epic (#7, capability `app-shell`).

## What Changes

- Edgewise remembers the capture settings as they change and restores them on the next launch: the selected device, sample rate, duration, pre-trigger, each channel's name, colour, visibility and trigger condition, and the decoders with their settings and visibility.
- If the remembered device isn't connected at launch, the first available device is selected. The other settings are kept where they still apply: the sample rate if the device supports it (otherwise its default rate), channel settings for channels the device has, and decoders whose channels all exist on the device.
- Opening a `.sr` file still takes channel names from the file (no change to `capture-files`).
- A new Capture → Reset Capture Settings menu item puts every remembered setting back to its default and forgets the saved settings. It does not touch the current capture.

### Non-goals

- Remembering the capture itself, the view (zoom, pan, markers), window size or position, or the decoded-data table selection.
- Multiple named setups or profiles, or import/export of settings.
- Remembering settings per device (one set of settings is kept, whatever device it was made with).
- Changing what happens when the user picks a different device during a session (channel list reset on a different channel count stays as specified).
- Changing how a disconnected selection behaves during a session (change `35-reselect-fx2-on-replug`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `app-shell`: adds requirements for remembering capture settings across launches and for resetting them to defaults; the Menus requirement gains Capture → Reset Capture Settings.

## Impact

- `src/renderer/src/`: a new module that turns the remembered part of the store into a saved form and back, validating and clamping it against the connected devices; persisted in the renderer's `localStorage` (kept by Electron in the app's user data folder), so no new engine or bridge methods.
- `src/renderer/src/actions.ts`: launch-time device selection and decoder re-creation from the saved settings; a reset action; channel-list resets keep remembered names where they apply.
- `src/renderer/src/App.tsx`: restore on start, save on change, handle the `reset` menu command.
- `src/main/index.ts`: Capture menu item that sends `reset`.
- Tests: Vitest unit tests for saving, restoring and clamping; a `scripts/ui.mjs` check that reloads the app and confirms settings come back and that reset clears them.
