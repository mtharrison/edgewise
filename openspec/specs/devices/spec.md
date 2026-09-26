# devices Specification

## Purpose
Discovers the capture sources available to Edgewise and describes each one's channels, sample rates and readiness, including loading firmware onto FX2 boards that need it.

## Requirements

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

### Requirement: Demo device
The system SHALL provide an 8-channel demo device that streams a repeating 20 ms synthetic pattern in real time: UART at 115200 baud on D0, I²C at 400 kHz on D1 (SCL) and D2 (SDA), SPI at 2 MHz on D3 (clock), D4 (MOSI), D5 (MISO) and D6 (chip select, active low), and 10 kHz PWM with a sweeping duty cycle on D7. Its sample rates SHALL be 4, 8, 10, 20, 25, 50 and 100 MHz, with 20 MHz as the default.

#### Scenario: Demo pattern decodes
- **WHEN** the demo device is captured at 20 MHz and decoded with matching UART, I²C and SPI settings
- **THEN** the UART text begins "Hello", the I²C data reads `Write 0x50, 0x10, 0xDE, 0xAD, Write 0x50, 0x10, Read 0x50, 0xBE, 0xEF`, and the first SPI MISO words read `0xFF, 0xEF, 0x40, 0x18`

#### Scenario: Demo streams in real time
- **WHEN** a capture runs on the demo device
- **THEN** samples arrive at the selected sample rate in wall-clock time, in blocks of about 10 ms

### Requirement: Supported FX2 boards
The system SHALL recognise these boards by USB vendor and product id: Saleae Logic clone (0925:3881), Cypress FX2 (04b4:8613), sigrok FX2 LA 8ch (1d50:608c) and 16ch (1d50:608d), and CWAV USBee AX (08a9:0014), DX (08a9:0015), SX (08a9:0009) and ZX (08a9:0005). DX and the 16ch LA SHALL report 16 channels; the others SHALL report 8. FX2 boards SHALL offer sample rates from 20 kHz to 24 MHz (20k, 25k, 50k, 100k, 200k, 250k, 500k, 1M, 2M, 3M, 4M, 6M, 8M, 12M, 16M, 24M), defaulting to 24 MHz.

#### Scenario: Stable id across re-enumeration
- **WHEN** a board re-enumerates on the same physical USB port (for example after firmware upload)
- **THEN** its device id is unchanged

#### Scenario: Unsupported sample rate
- **WHEN** a capture is started on an FX2 board at a rate that cannot be derived from its 48 MHz or 30 MHz clock
- **THEN** the capture ends in state `error` with the message "Unsupported sample rate <rate>"

### Requirement: Firmware readiness note
For an FX2 board that is not yet running fx2lafw firmware, the device entry SHALL carry a note: "Firmware will be uploaded on first capture" if the matching `.fw` file was found, or "Needs <file> in a firmware folder" if it was not. When the file was not found, the device entry SHALL also report the missing file's name in a separate field, so the UI does not have to read the note. A board already running fx2lafw SHALL have no note and no missing file.

#### Scenario: Firmware file missing
- **WHEN** a bare FX2 board is listed and its firmware file is in none of the firmware folders
- **THEN** its note names the missing `.fw` file
- **AND** its missing-firmware field holds the same file name

#### Scenario: Firmware file found
- **WHEN** a bare FX2 board is listed and its firmware file is in a firmware folder
- **THEN** its note is "Firmware will be uploaded on first capture" and its missing-firmware field is empty

### Requirement: Firmware folders
The system SHALL search for firmware, in order, in: the app's user firmware folder (created at startup), the app's bundled firmware folder, the `sigrok-firmware` folder inside any installed PulseView app in `/Applications`, `/opt/homebrew/share/sigrok-firmware`, `/usr/local/share/sigrok-firmware`, `/usr/share/sigrok-firmware`, and `~/.local/share/sigrok-firmware`. Folders that do not exist SHALL be ignored.

#### Scenario: PulseView installed
- **WHEN** PulseView is installed in `/Applications` with its bundled firmware
- **THEN** Edgewise can upload firmware to a bare board without the user copying any files

### Requirement: Firmware upload
When a capture starts on a board without fx2lafw firmware, the system SHALL upload the matching firmware to the board's RAM, report "Uploading firmware…" as progress, wait up to 5 seconds for the board to re-enumerate, and then continue the capture. Only fx2lafw firmware major version 1 SHALL be accepted. If the matching firmware file is in none of the firmware folders when the engine starts the capture (for example, it was removed after the device list), the capture SHALL fail with "Firmware <file> not found."

#### Scenario: Upload succeeds
- **WHEN** a capture starts on a bare board whose firmware file is available
- **THEN** the status message shows "Uploading firmware…" and the capture proceeds once the board re-enumerates

#### Scenario: Firmware file removed after listing
- **WHEN** the engine starts a capture on a bare board whose firmware file is in none of the firmware folders
- **THEN** the capture ends in state `error` with the message "Firmware <file> not found."

#### Scenario: Board does not come back
- **WHEN** the board does not re-enumerate within 5 seconds after upload
- **THEN** the capture fails with "Device did not re-enumerate after firmware upload"

#### Scenario: Wrong firmware version
- **WHEN** the board reports an fx2lafw major version other than 1
- **THEN** the capture fails with "Unsupported fx2lafw firmware version <major>.x"

### Requirement: Choose firmware folder on start
When the user starts a capture on a board whose device entry reports a missing firmware file, the app SHALL NOT start the capture yet. It SHALL show a dialog titled "Firmware <file> not found" that says to download sigrok-firmware-fx2lafw and choose the folder containing the `.fw` files, with the buttons Choose Folder… and Cancel. Choose Folder… SHALL open a folder picker. If the chosen folder contains the missing file, the app SHALL copy every `.fw` file in that folder into the app's user firmware folder, search the firmware folders again, re-list the devices and start the capture. If it does not, the dialog SHALL show again and name the folder and the missing file. Cancel in either the dialog or the folder picker SHALL leave the capture not started, with no error.

#### Scenario: Chosen folder has the firmware
- **WHEN** the user starts a capture on a bare board whose firmware file is missing, chooses Choose Folder…, and picks a folder that contains the file
- **THEN** the folder's `.fw` files are copied into the user firmware folder, the board's missing-firmware field is empty after the re-list, and the capture starts
- **AND** on the next launch the board is listed with "Firmware will be uploaded on first capture"

#### Scenario: Chosen folder lacks the firmware
- **WHEN** the user picks a folder that does not contain the missing file
- **THEN** nothing is copied and the dialog shows again, naming the folder and the file

#### Scenario: Cancel
- **WHEN** the user chooses Cancel in the dialog or closes the folder picker without choosing
- **THEN** no capture starts and no error is shown

#### Scenario: Firmware already available
- **WHEN** the user starts a capture on a device with no missing firmware file
- **THEN** no dialog is shown and the capture starts as usual

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
- **THEN** the state is `waiting` until D0 rises, and the capture ends in `done` with 100 000 samples and the trigger at the first rising edge of D0, preceded by up to 10 000 samples

#### Scenario: sigrok-cli fails to open the device
- **WHEN** `sigrok-cli` logs an error and exits without sending samples
- **THEN** the capture ends in state `error` and the message is that logged line
