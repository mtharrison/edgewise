# Design

## Context

Capture sources live in `crates/logic-core/src/devices/`. Each one implements `Driver::acquire(samplerate, sink, stop, progress)`, and the engine's acquisition thread feeds `sink` into the trigger `Feeder`, so the sample limit, software trigger and pre-trigger already work for any driver. `devices::list()` runs on every call, and the renderer calls it on launch, on the rescan button and every 3 s. The N-API binding is synchronous, so a slow call blocks the Electron main process. The FX2 driver's stall policy is to end the capture after 1 s with no data, keeping what was captured.

Facts from the issue that constrain the design (checked by the maintainer on real hardware):
- libsigrok's fx2lafw driver uploads firmware during `--scan`, so a sigrok scan that reaches FX2 boards would fight the native driver.
- `sigrok-cli --continuous -O binary` sustains 24 MB/s through a pipe, and writing one byte to its stdin stops it cleanly with the data flushed.
- The pipe buffer is 64 KB, so the reader must never stall.
- Serial-port drivers can take seconds to probe.

## Goals / Non-Goals

**Goals:**
- A self-contained `devices/sigrok.rs`: locating the binary, parsing its output, scanning, and a `Driver` impl. The parsers are pure functions, unit-tested against captured output.
- The existing capture pipeline is reused unchanged: sigrok is just another `Driver`.

**Non-Goals:**
- Persisting the `sigrok-cli` path or showing its status in the UI (#58).
- Passing sigrok device options (thresholds, clock edge, external clock).
- Firmware handling for sigrok drivers that need it. `sigrok-cli` uses its own firmware folders.

## Decisions

**Locating.** Search order as in the spec. On Windows, look for `sigrok-cli.exe` in `%ProgramFiles%\sigrok\sigrok-cli` and `%ProgramFiles(x86)%`. A candidate is accepted only if `sigrok-cli -V` exits 0 within 5 s. Parse the version from the first line (`sigrok-cli 0.7.2`) and the libsigrok version from the "Libraries and features" block (`libsigrok 0.5.2/...`). `-L` gives the "Supported hardware drivers" block: indented `name   description` lines up to the next blank line. Location runs as part of each full scan, so installing `sigrok-cli` and then pressing rescan works without a restart. The engine keeps an optional override path. The main process sets it from `EDGEWISE_SIGROK_CLI` for now, and #58 will set it from the UI.

**Allow-list** (logic analyzers only, no FX2 families, no `demo`): `asix-sigma`, `beaglelogic`, `chronovu-la`, `dreamsourcelab-dslogic`, `hantek-4032l`, `ikalogic-scanalogic2`, `ikalogic-scanaplus`, `kingst-la2016`, `lecroy-logicstudio`, `ols`, `p-ols`, `saleae-logic16`, `saleae-logic-pro`, `sysclk-lwla`, `zeroplus-logic-cube`. Intersect it with the drivers from `-L`, so a 0.5.2 build simply skips `kingst-la2016`. Add names from `EDGEWISE_SIGROK_DRIVERS`, but never `fx2lafw`: that stays excluded even if it is added, to protect the native driver. The alternatives were a bare `sigrok-cli --scan` (scans every driver, including fx2lafw) and a deny-list (a new libsigrok driver for a natively supported family would slip through). Both were rejected.

**Scanning.** For each driver, run `sigrok-cli -d <driver> --scan`, all drivers in parallel on their own threads, each killed after 10 s. Each output line looks like `<driver>[:conn=<c>] - <description> with <n> channels: D0 D1 … A0 …`. For each device, run `sigrok-cli -d <driver>[:conn=<c>] --show` and take the logic channel names from the "Channels:" block (skip `ANALOG` entries; the 0.5.2 format tags them) and the `samplerate` line, which is either a comma-separated list (`20 kHz, 25 kHz, …`) or a range (`… - … in steps of …`). The parsers accept both the 0.7.2/libsigrok 0.5.2 format and the git-master format, which is covered by separate fixtures. The engine caches the result as `Vec<SigrokDevice>` (the `DeviceInfo` plus the `-d` spec and channel names used to capture), and `list_devices()` merges it in order. The scan does not hold the engine lock while `sigrok-cli` runs.

**Async rescan.** Add `Engine::rescan_devices()` (blocking) and expose it from `logic-node` as a napi `AsyncTask`, so it runs on the libuv thread pool and resolves a Promise with the device list. `listDevices` stays synchronous and cheap. The alternative was a background scan whose results the 3-second refresh picks up later. It was rejected because launch would then fit remembered settings to a list with no sigrok devices yet. In the renderer, `refreshDevices()` gains a `rescan` flag. Launch and the rescan button pass it, and a `scanning` store flag disables the rescan button.

**Device id.** `sigrok:<driver>` or `sigrok:<driver>:<conn>`. This uses the conn that sigrok reports, which for USB devices is `bus.address` and can change on replug, so a replugged sigrok device may get a new id. That matches what sigrok reports; stable matching across replugs is not in scope here (see follow-ups).

**Capture.** Spawn `sigrok-cli -d <spec> -C <D0,…> -c samplerate=<r> --continuous -O binary -l 4` with stdin, stdout and stderr piped. The output unit is ceil(channels/8) bytes, which matches the engine's `unit` for ≤16 channels. Three threads:
- The stdout reader loops on `read()` into 64 KB buffers and sends them over an unbounded `std::sync::mpsc` channel. It never waits on the consumer, so the pipe cannot back up.
- The stderr reader sends each line to `progress` while no data has arrived, and always keeps the last line for error messages.
- The acquisition thread `recv_timeout(50 ms)`s, pushes into `sink`, and checks `stop`, the 1 s stall once data has started, and the 10 s no-data timeout. Before the first byte, it also checks whether the process has already exited.

To stop (stop flag, sink returns false, or error), write one byte to stdin and close it. Then wait up to 1 s for the process to exit, draining any remaining stdout into `sink` unless the sink has asked to stop, and kill the process if it has not exited. The stall message reuses the FX2 wording. When the process exits early after sending data, the capture ends in `error` with "Device disconnected" if the last log line mentions a USB/device error, or otherwise that line.

**Sample rates from a range.** Offer the 1-2-5 series within [min, max] plus max itself. The default is the highest offered rate ≤ 24 MHz: USB 2 pipe throughput is the practical ceiling.

**UI check.** `checks/sigrok-demo.mjs` (run with `node scripts/ui.mjs`) launches with `EDGEWISE_SIGROK_DRIVERS=demo`, selects the sigrok demo device, runs a 100 ms capture at 1 MHz, and asserts `done` with 100 000 samples plus a screenshot of the waveform. `scripts/ui.mjs` already passes the environment through. The setup action installs `sigrok-cli` from apt when `electron` is set, and `ci.yml` runs the check.

## Risks / Trade-offs

- [Git-master output format differs from 0.7.2 in ways fixtures miss] → Keep the parsers tolerant: match on keywords, ignore unknown lines, and fall back to "no devices" rather than an error. The git-master fixture comes from a real build. If the implementer cannot produce one, it is listed under Not verified for the maintainer.
- [The agent building this may not have `sigrok-cli` locally] → The setup-action change makes it available on the next CI run. If the check cannot run locally, it is confirmed in the PR's CI run, or listed under Not verified.
- [A scan with many allow-listed drivers spawns many processes] → The drivers run in parallel and each is capped at 10 s, so the scan finishes in 10 s at most. It only runs at launch and on rescan.
- [Launch waits for the sigrok scan before the device list appears] → Only when `sigrok-cli` exists. It is bounded at 10 s and usually under 1 s for USB drivers.
- [Orphaned `sigrok-cli` if the app crashes mid-capture] → stdin closes when the parent dies. During implementation, check whether `sigrok-cli` stops on EOF as it does on a byte, and note the result here. Not checked: no `sigrok-cli` was available in the build job, so this is left for the maintainer.

## Follow-up issue candidates

- `35-reselect-fx2-on-replug` is merged but its change folder was never archived, so the main `app-shell` spec still has the old "Device selection" text.
- The `app-shell` bridge allow-list in the main spec leaves out `burstAt`, which the code allows. This change's delta adds it.
- sigrok device ids use the USB bus.address, which can change on replug. Matching a replugged sigrok device the way #35 does for FX2 boards would need a stable identity (such as a serial number) from `--show`.
