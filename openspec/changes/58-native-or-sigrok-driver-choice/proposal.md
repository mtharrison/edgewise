# Proposal

## Why

Delivers #58, part of the App shell epic (#7, capability `app-shell`). An FX2 board that Edgewise drives natively can now also be captured through `sigrok-cli` (#55, #66), which helps when the native driver misbehaves, when sigrok has a feature the native driver lacks, or to confirm that a hardware problem is not an Edgewise one. Today that works by listing the board a second time as a separate sigrok device, which gives it a second id, breaks replug handling (#35) and remembered selection for that entry, and makes libsigrok upload firmware during every scan. The user also has no way to see whether `sigrok-cli` was found, or to point Edgewise at a particular build such as a vendor's fork, other than an environment variable.

## What Changes

- **Hardware section in the right panel.** It shows the `sigrok-cli` in use (path and version), or "Not found" with a link to sigrok's download page. The user can choose a different executable, or go back to the automatic search. The choice is remembered across launches and takes effect with a rescan.
- **Driver choice per device.** When the selected device can be driven both natively and through `sigrok-cli` (an FX2 board, with a `sigrok-cli` that has the `fx2lafw` driver), a Native / sigrok-cli choice appears with the device, defaulting to Native. The choice is remembered per device model across launches. No choice is shown without `sigrok-cli`, on the demo device, or on a sigrok-only device.
- **The board keeps its native identity under either choice.** It is still found and listed by Edgewise's own USB scan, once, with the same id, name, sample rates, firmware note and replug behaviour. Only capture changes: with sigrok-cli chosen, the capture runs one `sigrok-cli` for that board, addressed by its current USB bus and address, with the folder that holds the board's firmware file given to sigrok as its firmware folder. libsigrok uploads firmware itself, and its log lines are shown as progress, as for any sigrok capture.
- **BREAKING (reverses #66):** `fx2lafw` is removed from the sigrok scan allow-list, so an FX2 board is no longer listed a second time as a `sigrok` device and no sigrok scan of FX2 boards is ever run. A remembered selection of one of those `sigrok:fx2lafw:…` entries falls back like any device that is no longer listed. `fx2lafw` can still be added through `EDGEWISE_SIGROK_DRIVERS` for debugging.
- `EDGEWISE_SIGROK_CLI`, when set, still wins over the remembered executable, so automated checks can pin a build.

### Non-goals

- Bundling `sigrok-cli`.
- Mixing drivers within one capture.
- Exposing sigrok-only device options (thresholds, pattern modes).
- A driver choice for boards other than the FX2 family, or for sigrok-only devices.
- Changing how the native driver finds, identifies or uploads firmware to boards.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `app-shell`: new Hardware section and driver choice requirements; the engine bridge allow-list gains the calls they need; `EDGEWISE_SIGROK_CLI` now takes precedence over the remembered executable.
- `devices`: the device listing no longer lists an FX2 board twice; the sigrok scan allow-list drops `fx2lafw`; a native FX2 entry reports whether it can also be driven through `sigrok-cli`; a new requirement covers capturing an FX2 board through `sigrok-cli` under its native identity; the given `sigrok-cli` path can change while the app runs.

## Impact

- `crates/logic-core/src/devices/sigrok.rs`: drop `fx2lafw` from `ALLOWED`; build a capture for a native FX2 board (`-d fx2lafw:conn=<bus>.<address>`, `SIGROK_FIRMWARE_DIR`).
- `crates/logic-core/src/devices/fx2lafw.rs`, `devices/mod.rs`: resolve the board's current bus and address from its id; report on `DeviceInfo` whether `sigrok-cli` can drive it; `open` takes the driver choice.
- `crates/logic-core/src/engine.rs`, `crates/logic-node/src/lib.rs`: `StartOptions` gains the driver choice.
- `src/main/index.ts`, `src/preload/index.ts`: dedicated calls to choose or clear the `sigrok-cli` executable, remembered in the user data folder and applied at launch.
- `src/renderer/src/components/RightPanel.tsx`, `TopBar.tsx`, `actions.ts`, `settings.ts`, `store.ts`, `types.ts`: Hardware section, driver choice, per-model memory.
- `scripts/checks/sigrok-fx2.mjs` rewritten for the new behaviour; a new `scripts/ui.mjs` check for the Hardware section and driver choice; README's sigrok paragraph.
- In flight: change `35-reselect-fx2-on-replug` edits `app-shell` Device selection; this change does not touch that requirement.
