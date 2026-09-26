# Tasks

## 1. Parse sigrok-cli output

- [ ] 1.1 Add fixtures under `crates/logic-core/tests/fixtures/sigrok/` with real `-V`, `-L`, `--scan` and `--show` output from sigrok-cli 0.7.2 (libsigrok 0.5.2; `apt install sigrok-cli`, demo driver plus any board available) and from a git-master build. Verify the files exist and note in each one where it came from. If no git-master build is available, list that fixture under Not verified.
- [ ] 1.2 In a new `crates/logic-core/src/devices/sigrok.rs`, add pure parsers for version (`-V`), driver list (`-L`), scan lines (driver, conn, description, logic channels) and `--show` (logic channel names, sample-rate list or range). Verify with `cargo test -p logic-core` unit tests over both fixture sets, including one that checks analog channels are dropped.
- [ ] 1.3 Add the sample-rate helper (1-2-5 series for a range, plus the maximum) and the default-rate rule (highest ≤ 24 MHz, else the lowest). Verify with unit tests for the spec's "Rate range" scenario and for a list whose rates are all above 24 MHz.
- [ ] 1.4 Add the >16-logic-channel rule (capture the first 16, and add a note that says so). Verify with a unit test.

## 2. Find sigrok-cli and scan

- [ ] 2.1 Implement locating `sigrok-cli` (override path, else `PATH`, `/opt/homebrew/bin`, `/usr/local/bin`, Windows `Program Files`). Accept a candidate only if `-V` succeeds within 5 s. Verify with a unit test that the search order comes from an injected `PATH`/candidate list, and that a non-executable or missing override yields "not found".
- [ ] 2.2 Implement the allow-list: the drivers in design.md, intersected with `-L`, plus `EDGEWISE_SIGROK_DRIVERS`, with `fx2lafw` always removed. Verify with unit tests that `fx2lafw` is excluded even when added through the variable, and that `demo` is included only through the variable.
- [ ] 2.3 Implement the scan: one thread per driver, each killed after 10 s, followed by `--show` for each device found, producing `DeviceInfo` (id `sigrok:<driver>[:<conn>]`, driver `sigrok`, note "via sigrok-cli <version>") plus what capture needs. Verify with a unit test that a stub executable which sleeps past the timeout contributes nothing while the other drivers still return devices.
- [ ] 2.4 In `engine.rs`, cache the scan and the located binary. Add `rescan_devices()` and `sigrok_status()` (path and version, or not found plus the download page). `list_devices()` returns FX2, then the cached sigrok devices, then demo, and never runs `sigrok-cli`. Update the device listing order in `devices/mod.rs`. Verify with a unit test that `list_devices()` does not spawn processes (for example, a stub binary that records calls) and that the order is FX2, sigrok, demo.
- [ ] 2.5 If `sigrok-cli` is installed locally, verify `rescan_devices()` with `EDGEWISE_SIGROK_DRIVERS=demo` lists the demo device with 8 channels in an `#[ignore]`d integration test that CI runs explicitly. Otherwise, rely on the CI run.

## 3. Capture through sigrok-cli

- [ ] 3.1 Implement the `sigrok` `Driver`: spawn with the command line from design.md, a stdout reader thread feeding an unbounded channel, a stderr reader for progress and the last error line, and an acquisition loop enforcing stop, the 1 s stall after the first data, and the 10 s no-data timeout. Route `sigrok:` ids in `devices::open`. Verify `cargo test -p logic-core` passes.
- [ ] 3.2 Implement stop: write one byte to stdin, drain for up to 1 s, then kill. Verify with a unit test against a stub executable (a small script that streams bytes until stdin has input) that stop returns in under 1.5 s and keeps the bytes received.
- [ ] 3.3 Verify the error paths with stub-executable unit tests: exit before data (error is the last logged line), silence after data (the "Device stopped sending after <n> samples…" message, samples kept), and no data within 10 s ("sigrok-cli sent no data").
- [ ] 3.4 With a real `sigrok-cli` (locally, or in the CI integration test from 2.5), verify that a 100 ms capture at 1 MHz on the demo device ends `done` with 100 000 samples, and that a 100 000-sample capture with a rising trigger on D0 and 10% pre-trigger records the trigger at sample 10 000.

## 4. Bridge and UI wiring

- [ ] 4.1 In `crates/logic-node/src/lib.rs`, expose `rescanDevices` as an `AsyncTask` returning the device list, and `sigrokStatus`. Add both to `ENGINE_METHODS` in `src/main/index.ts`, and set the engine's override path from `EDGEWISE_SIGROK_CLI` at startup. Verify with `npm run typecheck` and a build (`npm run build`).
- [ ] 4.2 In `src/renderer/src/actions.ts`, give `refreshDevices` a `rescan` option that calls `rescanDevices` and sets a `scanning` store flag. Launch (`App.tsx`) and the rescan button (`TopBar.tsx`) use it, the rescan button is disabled while `scanning`, and the 3-second tick is unchanged. Verify with `actions.test.ts` cases: rescan calls `rescanDevices` and the tick calls `listDevices`, `pendingRestore` fits to the rescan result so a remembered `sigrok:` device is selected, and a new sigrok device in a rescan does not change the selection.
- [ ] 4.3 Add `.github/actions/setup/action.yml` installing `sigrok-cli` with xvfb when `electron` is set. Add a CI step running `node scripts/ui.mjs checks/sigrok-demo.mjs` with `EDGEWISE_SIGROK_DRIVERS=demo`, plus the integration tests from 2.5. Verify that the PR's CI run passes these steps.
- [ ] 4.4 Write `checks/sigrok-demo.mjs`: wait for the sigrok demo device in the picker, check its "via sigrok-cli" note, select it, pick 1 MHz and 100 ms, start, wait for Done, and assert the status bar shows 100 000 samples. Take screenshots of the picker and the waveform. Run it with `EDGEWISE_SIGROK_DRIVERS=demo node scripts/ui.mjs checks/sigrok-demo.mjs` (locally if `sigrok-cli` is installed, otherwise in CI) and Read the screenshots.
- [ ] 4.5 Run `node scripts/ui.mjs` without `sigrok-cli` on `PATH` (for example `EDGEWISE_SIGROK_CLI=/nonexistent`) and verify from the screenshot that the device list is only the demo device (plus any FX2 board), as before.

## 5. Real hardware (maintainer)

- [ ] 5.1 List under Not verified: a real non-FX2 board (for example a DSLogic) is listed "via sigrok-cli" with its rates, and captures, stops within about 1 s, and ends in `error` with data kept when unplugged mid-capture. An FX2 board connected at the same time appears once, with driver `fx2lafw`.

## 6. Verify and archive

- [ ] 6.1 Run `npm test` and `npm run typecheck`, and verify both pass.
- [ ] 6.2 Run `openspec-verify-change` for `55-sigrok-cli-fallback` and fix what it finds.
- [ ] 6.3 Archive the change with `openspec-archive-change`, and verify that `npx openspec validate --all --strict` passes.
