# Design

## Context

See proposal.md for why. Relevant current state:

- `devices::list` concatenates the native FX2 scan, the cached sigrok scan and the demo device. Since #66, `fx2lafw` is on the sigrok allow-list, so an FX2 board also appears as `sigrok:fx2lafw:<conn>`, and libsigrok uploads firmware to a bare board during the scan.
- `devices::open(id, …)` picks a driver from the id prefix (`demo`, `fx2:`, `sigrok:`). `Sigrok` captures from a `SigrokDevice { cli, spec, channels, unit, info }`; it already handles progress from log lines, sample limits via the engine's `Feeder`, stop over stdin, and the no-data / early-exit errors.
- FX2 ids are `fx2:<vid>:<pid>:<port_key>`, where `port_key` is the macOS location id or, elsewhere, the bus number. Neither is the USB device address sigrok's `conn=` wants, and the address changes when a board re-enumerates.
- The engine already has `set_sigrok_path(Option<PathBuf>)`, applied at the next `rescan_devices`. `src/main/index.ts` sets it once from `EDGEWISE_SIGROK_CLI` with a comment pointing at #58. `sigrokStatus` is on the bridge and in `api.ts`, but nothing renders it.
- Capture settings live in `localStorage` under `edgewise.settings` (`settings.ts`); `sameFx2Model` compares ids by vid:pid.
- Change `35-reselect-fx2-on-replug` is in flight in `actions.ts` `refreshDevices`. This change keys on the same vid:pid and does not touch selection logic.

## Goals / Non-Goals

**Goals:**
- One `sigrok-cli` process per capture for an FX2 board, reusing the existing `Sigrok` capture loop unchanged.
- The FX2 device entry, id and all selection logic identical under either driver.

**Non-Goals:**
- Making `port_key` a true per-port identity on Linux (see follow-ups).
- Any change to the native FX2 driver.

## Decisions

### 1. Driver choice travels in `StartOptions`, not in the device id

`StartOptions` gains `via: "native" | "sigrok"` (serde default `native`). `devices::open` takes it; for an `fx2:` id with `via = sigrok` it builds a `SigrokDevice` on the fly and returns `Sigrok::new(dev)`.

*Alternative:* a separate id such as `fx2:…:sigrok`. Rejected: it is what #66 effectively did, and it changes the id that selection, remembered settings and replug matching all key on.

### 2. Addressing the board: resolve bus.address at start

A new `fx2lafw::usb_address(id) -> Option<(u8, u8)>` finds the board the same way `Fx2::find` does (vid, pid, port_key) and returns `(bus_number, device_address)`. The spec is `fx2lafw:conn=<bus>.<address>`. If the board is not found, the start fails with the native driver's existing "not found" message.

On a bare board, libsigrok uploads firmware and the board re-enumerates with a new address; libsigrok's fx2lafw driver re-finds it by USB port path, so the `conn` given at start only has to be right before upload.

### 3. Firmware folder via `SIGROK_FIRMWARE_DIR`

`sigrok-cli` has no firmware-path flag; libsigrok reads `SIGROK_FIRMWARE_DIR`. `SigrokDevice` gains `env: Vec<(String, String)>`, set on the spawned command. For an FX2 board it is the first firmware folder that holds the profile's firmware file (`find_firmware`, already used by the native driver). If none has it, the variable is not set and libsigrok falls back to its own folders; if those also lack it, `sigrok-cli`'s own error line becomes the capture error, as for any early exit. The native "Choose firmware folder on start" dialog still runs first because it keys on `missingFirmware`, which is unchanged.

### 4. Channels and unit from the FX2 profile

Channels are `D0`…`D7` or `D0`…`D15` (sigrok's fx2lafw channel names), `unit` is 1 or 2. Sample rates stay the native list; every one is a rate fx2lafw accepts, so the picker does not change with the driver.

### 5. "Can also be captured through sigrok-cli" on `DeviceInfo`

`DeviceInfo` gains `sigrok: bool` (serialised `sigrok`). `devices::list` receives the cached `Option<Cli>` and sets it on FX2 entries when `cli.drivers` contains `fx2lafw`. It is based on the last scan, so it changes only on rescan, consistent with other sigrok state. `devices::open` rejects `via = sigrok` when the flag would be false, with "<name> can't be captured through sigrok-cli".

### 6. Drop `fx2lafw` from `ALLOWED`

Removes the duplicate entry and the firmware upload during scans (the module doc comment is updated). `EDGEWISE_SIGROK_DRIVERS=fx2lafw` still re-enables the old listing for debugging. The `allow_list_has_fx2lafw_but_never_demo_by_default` test flips.

### 7. Executable choice lives in the main process

Two dedicated IPC calls, not bridge methods: `sigrok:choose` (open-file dialog; on pick, save and `engine.setSigrokPath(path)`; returns whether one was chosen) and `sigrok:clear`. The renderer then calls `refreshDevices({ rescan: true })` and `sigrokStatus`. The choice is stored in `<userData>/settings.json` (`{ sigrokCli: string | null }`) because the main process needs it before the renderer exists, at the same point that reads `EDGEWISE_SIGROK_CLI`. Precedence: env var, then stored choice, then search. When the env var is set, Choose… still stores the choice but the env var stays in effect for that run.

*Alternative:* keep it in `localStorage` and have the renderer push the path over the bridge. Rejected: it would put an arbitrary-executable setter on the bridge, which is what the restricted bridge exists to prevent.

### 8. Per-model driver choice in its own renderer key

`localStorage['edgewise.drivers']` maps `"<vid>:<pid>"` to `"sigrok"` (Native is the absence of an entry). It is separate from `edgewise.settings` so Reset Capture Settings, which rewrites that key, leaves it alone. `store.ts` gains `via` for the selected device, derived on selection and on refresh from the map and `device.sigrok`; `startCapture` passes it. A helper `fx2Model(id)` is factored out of `sameFx2Model`.

### 9. UI placement

- Top bar: a two-option segmented control after the device picker, rendered only when `device.sigrok`, disabled with the other pickers while capturing.
- Right panel: a Hardware section first, above Analyzers: status line (path + version, or "Not found" + a download link), Choose… and "Use automatic search". The link calls a third dedicated IPC, `sigrok:download`, which opens the engine's fixed download URL with `shell.openExternal`; the renderer never passes a URL. The section reads `sigrokStatus` after each full scan (launch and rescan).
- The device picker's " via sigrok-cli" suffix stays; it still labels sigrok-only devices.

## Risks / Trade-offs

- [libsigrok re-finding a board after upload differs by version] → covered by the hardware check under Not verified; if it fails, fall back to letting sigrok address the board by vid.pid with `conn=<vid>.<pid>` (ambiguous only with two identical boards).
- [A user who picked the `sigrok:fx2lafw` entry from #66 loses that remembered selection] → falls back to the first listed device, as for any unlisted device; they re-pick the board and choose sigrok-cli once. Released only in 0.1.1, one day old.
- [`DeviceInfo.sigrok` goes stale if `sigrok-cli` is uninstalled mid-session] → the capture fails with `sigrok-cli`'s spawn error; a rescan clears the flag.
- [Windows: libsigrok needs a WinUSB driver bound to the board, which may conflict with the native driver] → out of scope; the choice is still shown when `sigrok-cli` reports `fx2lafw`.

## Follow-up issue candidates

- On Linux `port_key` is only the bus number, so two boards of the same model on one bus get the same id. Found while reading `fx2lafw.rs`; not fixed here.
