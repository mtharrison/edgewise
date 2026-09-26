# Spec Delta

## MODIFIED Requirements

### Requirement: Device listing
The system SHALL list every connected supported FX2 board, then every device found by the most recent sigrok scan, then a built-in demo device. Each entry SHALL report an id, display name, driver name, channel count, supported sample rates, default sample rate, and an optional human-readable note.

#### Scenario: No hardware connected
- **WHEN** devices are listed, no supported USB board is connected, and the sigrok scan found nothing or `sigrok-cli` is not installed
- **THEN** the list contains only the demo device

#### Scenario: Board connected
- **WHEN** a supported FX2 board is connected
- **THEN** it appears in the list before the demo device, with driver `fx2lafw`

#### Scenario: FX2 board and sigrok device connected
- **WHEN** an FX2 board is connected and the sigrok scan found a DSLogic
- **THEN** the list is the FX2 board, then the DSLogic, then the demo device

## ADDED Requirements

### Requirement: Finding sigrok-cli
The system SHALL look for a `sigrok-cli` executable in this order: the directories on `PATH`, `/opt/homebrew/bin`, `/usr/local/bin`, and on Windows `Program Files\sigrok\sigrok-cli`. If a `sigrok-cli` path has been given to the engine, the system SHALL use only that path and SHALL NOT search. For the executable it finds, the system SHALL record its version and the hardware drivers it reports. On request, the system SHALL report either the path and version of the `sigrok-cli` in use, or that none was found together with the address of sigrok's download page. If no working `sigrok-cli` is found, the device list SHALL be exactly what it would be without this feature.

#### Scenario: sigrok-cli on PATH
- **WHEN** `sigrok-cli` 0.7.2 is installed on `PATH`
- **THEN** the reported status gives its path and version 0.7.2

#### Scenario: Path given to the engine
- **WHEN** a path to a vendor build of `sigrok-cli` is given to the engine and another `sigrok-cli` is on `PATH`
- **THEN** the given build is the one used and reported

#### Scenario: sigrok-cli not installed
- **WHEN** no `sigrok-cli` can be found or run
- **THEN** the device list is unchanged and the reported status says it was not found and gives the download page

### Requirement: Sigrok scan
The system SHALL scan through `sigrok-cli` only for the sigrok drivers on an allow-list of logic-analyzer drivers that the found `sigrok-cli` also reports. The allow-list SHALL NOT contain any driver for a family that Edgewise drives natively, so FX2 boards are never scanned or opened by `sigrok-cli`. The allow-list SHALL NOT contain sigrok's `demo` driver. A comma-separated list of driver names in the `EDGEWISE_SIGROK_DRIVERS` environment variable SHALL be added to the allow-list. The scan SHALL run at launch and when the user asks for a rescan, and never as part of the regular device refresh. Its result SHALL be kept and reused by every device listing until the next scan. A driver whose scan takes longer than 10 seconds SHALL be treated as having found nothing, and the rest of the scan SHALL still complete.

#### Scenario: FX2 board connected with sigrok-cli installed
- **WHEN** an FX2 board is connected and a scan runs
- **THEN** `sigrok-cli` is not asked to scan for FX2 boards, and the board appears exactly once, with driver `fx2lafw`

#### Scenario: Regular refresh
- **WHEN** the device list refreshes on its 3-second interval
- **THEN** `sigrok-cli` is not run, and the sigrok devices from the last scan are listed

#### Scenario: Demo driver added for a check
- **WHEN** the app is launched with `EDGEWISE_SIGROK_DRIVERS=demo` and `sigrok-cli` installed
- **THEN** sigrok's demo device is listed through the fallback

#### Scenario: Slow serial driver
- **WHEN** one allow-listed driver has not finished scanning after 10 seconds
- **THEN** that driver contributes no devices, and devices found by the other drivers are listed

### Requirement: Sigrok device entries
Each device found by the sigrok scan SHALL be listed with an id that names the sigrok driver and, if sigrok reports one, the connection, so the same device gets the same id on every scan. The entry SHALL have the device description sigrok reports as its display name, driver `sigrok`, the note "via sigrok-cli <version>", a channel count equal to its number of logic channels, and the sample rates sigrok reports for it. When sigrok reports a range of rates instead of a list, the entry SHALL offer the rates in that range from the series 1, 2, 5 × 10ⁿ Hz, plus the range's upper end. The default sample rate SHALL be the highest offered rate that is no more than 24 MHz, or the lowest offered rate if every rate is higher. A device with more than 16 logic channels SHALL be listed with 16 channels and SHALL capture its first 16, and its note SHALL say that only the first 16 channels are captured. Analog channels SHALL be ignored.

#### Scenario: DSLogic found
- **WHEN** the scan finds a DSLogic Plus on USB connection 1.7 with `sigrok-cli` 0.7.2
- **THEN** it is listed with driver `sigrok`, 16 channels, the sample rates sigrok reports, and the note "via sigrok-cli 0.7.2"

#### Scenario: Stable id across scans
- **WHEN** the same sigrok device is found by two scans on the same connection
- **THEN** both scans give it the same id

#### Scenario: Device with analog channels
- **WHEN** the scan finds sigrok's demo device, which has 8 logic and 5 analog channels
- **THEN** it is listed with 8 channels

#### Scenario: Rate range
- **WHEN** sigrok reports that a device supports any rate from 1 kHz to 50 MHz
- **THEN** the entry offers 1 kHz, 2 kHz, 5 kHz, 10 kHz, … 10 MHz, 20 MHz and 50 MHz, and defaults to 20 MHz

### Requirement: Capture through sigrok-cli
Starting a capture on a sigrok device SHALL run `sigrok-cli` for that device with its logic channels and the chosen sample rate, and stream its samples into the capture as they arrive. Sample limit, software trigger and pre-trigger SHALL behave as they do for other devices. Lines that `sigrok-cli` writes to its log while starting, such as firmware upload, SHALL be shown as the progress message. Stopping, or reaching the sample limit, SHALL end `sigrok-cli` and return within about 1 second, keeping every sample received. If `sigrok-cli` exits before sending any samples, the capture SHALL end in state `error` with the last line it logged. If it sends no samples within 10 seconds of starting, the capture SHALL end in state `error` with "sigrok-cli sent no data".

#### Scenario: Timed capture
- **WHEN** a 100 ms capture at 1 MHz runs on a sigrok device
- **THEN** it ends in state `done` with 100 000 samples

#### Scenario: Stop an open-ended capture
- **WHEN** the user stops an open-ended capture on a sigrok device
- **THEN** the capture is in state `done` within about 1 second and the samples captured so far remain viewable

#### Scenario: Triggered capture
- **WHEN** a 100 000-sample capture on a sigrok device has a rising-edge trigger on D0 and a pre-trigger of 10%
- **THEN** the state is `waiting` until D0 rises, and the capture ends in `done` with 100 000 samples and the trigger at sample 10 000

#### Scenario: sigrok-cli fails to open the device
- **WHEN** `sigrok-cli` logs an error and exits without sending samples
- **THEN** the capture ends in state `error` and the message is that logged line
