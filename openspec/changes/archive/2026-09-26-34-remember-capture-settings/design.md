# Design

## Context

All capture settings live in the renderer's zustand store (`src/renderer/src/store.ts`): `deviceId`, `samplerate`, `duration`, `pretrigger`, `channels` (name, colour, visible, trigger per channel) and `decoders` (config, visible, plus engine id, rows and colour). Decoders also exist in the engine: `addDecoder(config)` returns an id and `decoderRows(config)` returns row names. Nothing is persisted today; on launch `refreshDevices()` selects the first listed device and `selectDevice()` rebuilds the channel list with `makeChannels()` when the channel count differs. `pollStatus()` also rebuilds the channel list with default names whenever the engine's channel count differs from the store's.

The selection logic already has in-session rules for a disconnected device (change `35-reselect-fx2-on-replug`, merged but not archived): a vanished selection stays selected and is shown disconnected. The launch rule in this change is different on purpose (the issue asks for the first available device when the remembered one is absent), so it applies only to the first device refresh after start-up.

## Goals / Non-Goals

**Goals:**
- One small, pure module that converts between the store and a saved form, validates it and fits it to a device, so it can be unit-tested without Electron.
- Restoring must not race the first device scan or the status poll.

**Non-Goals:**
- A settings file in the main process or any new bridge/engine method.
- Migrating saved data between versions beyond "unknown version → defaults".

## Decisions

**Storage in renderer `localStorage`, key `edgewise.settings`, JSON with a `version: 1` field.** Electron keeps `localStorage` in the app's user data folder, so it survives restarts and needs no IPC. Alternative: a JSON file written by the main process through a new bridge call. That adds an allow-list entry, file handling and async I/O for no user-visible gain. If a future need (e.g. settings shared with a CLI) appears, the saved form can move behind a bridge call without changing the module's interface.

**Save on every change, not on quit.** Subscribe to the store and write when any remembered field changes (compare the serialized string to the last write, so view/hover updates cost one cheap comparison and no write). Quitting via crash or force-kill still keeps the last settings. Alternative: save in `beforeunload`; unreliable on crash and on macOS window close.

**What is saved.** Device id; sample rate; duration; pre-trigger; per channel `{ name, color, visible, trigger }` by index; per decoder `{ config, visible }`. Decoder engine ids, row names and colours are not saved: ids are per-session, rows come from `decoderRows`, and colours are assigned by position as `addDecoder` does today.

**Restore flow.** On start, read and validate the saved settings before the first `refreshDevices()`. Put duration and pre-trigger into the store immediately (they do not depend on a device); invalid values (a duration not in `DURATIONS`, a pre-trigger outside 0–0.9) fall back to defaults. The first device refresh then picks the remembered device if listed (exact id, or `sameFx2Model` for a board on a new port), otherwise the first listed device, applies the sample rate if the device supports it, builds the channel list from the device's channel count overlaid with the remembered per-channel settings, and re-creates each decoder whose channels (`decoderChannels`) are all below the channel count, via `engine.addDecoder` / `engine.decoderRows`. Saving is switched on only after this restore finishes, so the defaults present during start-up never overwrite the saved settings.

**Channel-list rebuilds keep remembered settings.** `selectDevice` and `pollStatus` rebuild channels with defaults when the count differs. At start-up the engine's status may report a different channel count from the restored device (e.g. 8 before a 16-channel board is used), which would wipe the restored names. Restore therefore sets the channel list after the device is chosen and `pollStatus` must not reset it merely because the engine has not captured yet; the rebuild in `pollStatus` overlays the current channels' settings by index instead of starting from `makeChannels()` alone. `openFile` keeps using the file's names (spec: file names win).

**Reset.** Capture menu item sends `reset` over the existing `menu` channel. The renderer ignores it while `isBusy(status)`; otherwise it removes all decoders from the engine, sets defaults (store initial values for duration, pre-trigger; first listed device via `selectDevice`, with 20 MHz kept if supported; `makeChannels(n)`), and the save subscription writes the defaults. The capture and view are untouched.

**Opened file names become the remembered names.** Remembered settings follow what the UI shows, so after opening a `.sr` file its channel names are what gets remembered. Alternative: freeze remembered names while a file is open. Rejected as harder to explain ("why did my edits vanish?") and not asked for; the reviewer can ask for it if the wiring-names use case needs it.

## Risks / Trade-offs

- [Saved decoder config from an older build lacks a new field or has a bad value] → merge the saved config over `DECODER_DEFAULTS[kind]`, drop decoders of unknown kind, and drop any decoder the engine rejects (catch per decoder, no toast).
- [`localStorage` is per origin; dev (`ELECTRON_RENDERER_URL`) and packaged builds keep separate settings] → acceptable; dev and release settings being separate is harmless.
- [A UI check that restarts the app shares the developer's settings] → the check uses `page.reload()` in the app launched by `scripts/ui.mjs`, and resets settings at its end.
- [Restoring many decoders delays start-up] → decoders are re-created in parallel after the device is chosen; the waveform is usable meanwhile.

## Follow-up issue candidates

- Change `35-reselect-fx2-on-replug` was merged (#41) but its folder is still in `openspec/changes/` and `openspec/specs/app-shell/spec.md` still says the first listed device is selected when the selection disappears. It should be archived so the main spec matches the code.
- `pollStatus` replaces the whole channel list with default names whenever the engine's channel count differs, which also drops user renames after e.g. a load or capture with another device mid-session. This change fixes the overlay for its own needs; a broader review of when names should survive a channel-count change is out of scope.
