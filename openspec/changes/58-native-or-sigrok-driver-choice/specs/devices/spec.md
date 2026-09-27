# Spec Delta

## MODIFIED Requirements

### Requirement: Device listing
The system SHALL list every connected supported FX2 board, then every device found by the most recent sigrok scan, then a built-in demo device. Each entry SHALL report an id, display name, driver name, channel count, supported sample rates, default sample rate, an optional human-readable note, and whether the device can also be captured through `sigrok-cli`. An FX2 board SHALL appear in the list exactly once, whether or not `sigrok-cli` is installed.

#### Scenario: No hardware connected
- **WHEN** devices are listed, no supported USB board is connected, and the sigrok scan found nothing or `sigrok-cli` is not installed
- **THEN** the list contains only the demo device

#### Scenario: Board connected
- **WHEN** a supported FX2 board is connected
- **THEN** it appears in the list before the demo device, with driver `fx2lafw`

#### Scenario: FX2 board and sigrok device connected
- **WHEN** an FX2 board is connected, `sigrok-cli` is installed, and the sigrok scan found a DSLogic
- **THEN** the list is the FX2 board with driver `fx2lafw`, then the DSLogic with driver `sigrok`, then the demo device

### Requirement: Finding sigrok-cli
The system SHALL look for a `sigrok-cli` executable in this order: the directories on `PATH`, `/opt/homebrew/bin`, `/usr/local/bin`, and on Windows `Program Files\sigrok\sigrok-cli`. If a `sigrok-cli` path has been given to the engine, the system SHALL use only that path and SHALL NOT search. The given path SHALL be changeable, or cleared to go back to searching, while the app runs; the change SHALL take effect at the next scan. For the executable it finds, the system SHALL record its version and the hardware drivers it reports. On request, the system SHALL report either the path and version of the `sigrok-cli` in use, or that none was found together with the address of sigrok's download page. If no working `sigrok-cli` is found, the device list SHALL be exactly what it would be without this feature.

#### Scenario: sigrok-cli on PATH
- **WHEN** `sigrok-cli` 0.7.2 is installed on `PATH`
- **THEN** the reported status gives its path and version 0.7.2

#### Scenario: Path given to the engine
- **WHEN** a path to a vendor build of `sigrok-cli` is given to the engine and another `sigrok-cli` is on `PATH`
- **THEN** the given build is the one used and reported

#### Scenario: Path changed while running
- **WHEN** the given path is changed to another working `sigrok-cli` and a scan runs
- **THEN** the reported status gives the new path and its version

#### Scenario: Given path cleared
- **WHEN** the given path is cleared and a scan runs
- **THEN** the system searches again and reports the `sigrok-cli` it finds, or that none was found

#### Scenario: sigrok-cli not installed
- **WHEN** no `sigrok-cli` can be found or run
- **THEN** the device list is unchanged and the reported status says it was not found and gives the download page

### Requirement: Sigrok scan
The system SHALL scan through `sigrok-cli` only for the sigrok drivers on an allow-list of logic-analyzer drivers that the found `sigrok-cli` also reports. The allow-list SHALL NOT contain `fx2lafw`, which Edgewise drives natively, nor sigrok's `demo` driver, so no sigrok scan of FX2 boards runs by default. A comma-separated list of driver names in the `EDGEWISE_SIGROK_DRIVERS` environment variable SHALL be added to the allow-list. The scan SHALL run at launch and when the user asks for a rescan, and never as part of the regular device refresh. Its result SHALL be kept and reused by every device listing until the next scan. A driver whose scan takes longer than 10 seconds SHALL be treated as having found nothing, and the rest of the scan SHALL still complete.

#### Scenario: FX2 board connected with sigrok-cli installed
- **WHEN** an FX2 board is connected, `sigrok-cli` is installed, and a scan runs
- **THEN** `sigrok-cli` is not asked to scan for FX2 boards, and the board appears exactly once, with driver `fx2lafw`

#### Scenario: FX2 board connected without sigrok-cli
- **WHEN** an FX2 board is connected and no `sigrok-cli` is found
- **THEN** the board appears exactly once, with driver `fx2lafw`

#### Scenario: Regular refresh
- **WHEN** the device list refreshes on its 3-second interval
- **THEN** `sigrok-cli` is not run, and the sigrok devices from the last scan are listed

#### Scenario: Demo driver added for a check
- **WHEN** the app is launched with `EDGEWISE_SIGROK_DRIVERS=demo` and `sigrok-cli` installed
- **THEN** sigrok's demo device is listed through the fallback

#### Scenario: Slow serial driver
- **WHEN** one allow-listed driver has not finished scanning after 10 seconds
- **THEN** that driver contributes no devices, and devices found by the other drivers are listed

## ADDED Requirements

### Requirement: FX2 boards through sigrok-cli
An FX2 board's entry SHALL report that it can also be captured through `sigrok-cli` exactly when the `sigrok-cli` found by the last scan reports the `fx2lafw` driver; every other entry SHALL report that it cannot. A capture on an FX2 board SHALL be started either natively or through `sigrok-cli`, as the caller asks, and natively when the caller does not say. Through `sigrok-cli`, the system SHALL run one `sigrok-cli` addressed to that board by its current USB bus and address, without scanning, with the board's channels and the chosen sample rate, and SHALL tell it to load firmware from the firmware folder that holds the board's firmware file. The board's id, name, channels, sample rates and firmware note SHALL be the same whichever way it is captured. Sample limit, software trigger, pre-trigger, stopping, progress messages and errors SHALL behave as for any capture through `sigrok-cli`, and "Uploading firmware…" style progress on a bare board SHALL come from `sigrok-cli`'s log. Asking for a capture through `sigrok-cli` on an entry that cannot be captured that way SHALL fail with "<device name> can't be captured through sigrok-cli".

#### Scenario: Entry reports sigrok-cli support
- **WHEN** an FX2 board is connected and the last scan found a `sigrok-cli` that reports `fx2lafw`
- **THEN** the board's entry says it can also be captured through `sigrok-cli`, and the demo device's entry says it cannot

#### Scenario: No sigrok-cli
- **WHEN** an FX2 board is connected and no `sigrok-cli` was found
- **THEN** the board's entry says it cannot be captured through `sigrok-cli`

#### Scenario: Capture through sigrok-cli
- **WHEN** a 100 ms capture at 1 MHz is started through `sigrok-cli` on an FX2 board running fx2lafw
- **THEN** it ends in state `done` with 100 000 samples

#### Scenario: Bare board through sigrok-cli
- **WHEN** a capture is started through `sigrok-cli` on a board without fx2lafw firmware whose firmware file is in a firmware folder
- **THEN** `sigrok-cli` uploads the firmware, its log lines are shown as progress, and the capture proceeds

#### Scenario: Same identity afterwards
- **WHEN** a capture through `sigrok-cli` on an FX2 board ends and the devices are listed again
- **THEN** the board is listed once, with the same id as before the capture

#### Scenario: Not supported
- **WHEN** a capture through `sigrok-cli` is asked for on the demo device
- **THEN** it fails with "Demo device can't be captured through sigrok-cli" and no capture starts
