# Proposal

## Why

Delivers #55. Edgewise drives only one hardware family natively (FX2 boards running fx2lafw), so owners of any other logic analyzer cannot use it. An installed upstream `sigrok-cli` already supports about a dozen more families, and running it as a separate process gives Edgewise those boards without linking or bundling anything, so the MIT license and packaging stay as they are. This belongs to the Devices epic (#1), capability `devices`.

## What Changes

- Find an installed `sigrok-cli` (on `PATH`, in the Homebrew and `/usr/local` bin folders, or in `Program Files\sigrok`), or use a path given to the engine instead of the search. Record its version and the drivers it reports.
- Scan an allow-list of sigrok logic-analyzer drivers. The list leaves out every family Edgewise drives natively, so FX2 boards are never scanned by sigrok. The scan runs at launch and when the user presses rescan, never on the 3-second refresh, and its result is cached.
- List each device found, after the FX2 boards and before the demo device, with driver `sigrok`, the note "via sigrok-cli <version>", and the sample rates sigrok reports for it.
- Capture from these devices by streaming raw samples from `sigrok-cli` into the existing capture. Start, stop, sample limit, software trigger and pre-trigger work as they do for other devices. Stop returns within about a second. If the device goes silent for 1 s or goes away, the capture ends in `error` and keeps the samples captured so far.
- Report whether `sigrok-cli` was found (path and version) or not, together with where to download it, so that #58 can show it in the UI.
- An environment variable can add drivers to the allow-list, so a UI check can capture from sigrok's `demo` driver without hardware. CI installs `sigrok-cli` so that check runs there.

### Non-goals

- Bundling `sigrok-cli` with the app.
- Running sigrok's protocol decoders.
- Analog channels.
- Using `sigrok-cli` for boards Edgewise drives natively (#58).
- Any UI for the `sigrok-cli` status or for choosing its path (#58). This change only makes that status available.
- Sustaining USB 3 capture rates (#57).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `devices`: device listing gains sigrok devices between FX2 boards and the demo device. New requirements cover finding `sigrok-cli`, scanning (allow-list, when it runs, caching), how sigrok devices are described, and capturing through `sigrok-cli`.
- `acquisition`: "Keep data on device failure" now covers sigrok devices as well as FX2 boards.
- `app-shell`: the engine bridge gains a rescan-devices call and a `sigrok-cli` status call. A new "Device scanning" requirement says that launch and the rescan button run a full scan, the 3-second refresh does not, and the app stays responsive while a scan runs. "Device selection" is not modified, because the unarchived change `35-reselect-fx2-on-replug` already modifies it.

## Impact

- `crates/logic-core/src/devices/`: new `sigrok.rs` (locate, parse `-V`/`-L`/`--scan`/`--show` output, scan, capture driver). `mod.rs` gets listing order and `open()` routing for `sigrok:` ids.
- `crates/logic-core/src/engine.rs`: holds the cached sigrok scan and the `sigrok-cli` location, and exposes rescan and status.
- `crates/logic-node/src/lib.rs`: async `rescanDevices` so a scan that takes seconds does not block the Electron main process, plus `sigrokStatus`.
- `src/main/index.ts`: bridge allow-list, optional `EDGEWISE_SIGROK_CLI` path override.
- `src/renderer/src/actions.ts`, `App.tsx`, `TopBar.tsx`: launch and the rescan button call the rescan. The 3-second refresh stays as it is.
- `.github/actions/setup/action.yml`, `.github/workflows/ci.yml`: install `sigrok-cli` and run the new UI check.
- No new Rust or npm dependencies. At runtime, `sigrok-cli` is optional.
