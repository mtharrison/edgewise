# devices Specification

## Purpose
Discovers the capture sources available to Edgewise and describes each one's channels, sample rates and readiness, including loading firmware onto FX2 boards that need it.
## Requirements
### Requirement: Device listing
The system SHALL list every connected supported FX2 board followed by a built-in demo device. Each entry SHALL report an id, display name, driver name, channel count, supported sample rates, default sample rate, and an optional human-readable note.

#### Scenario: No hardware connected
- **WHEN** devices are listed and no supported USB board is connected
- **THEN** the list contains only the demo device

#### Scenario: Board connected
- **WHEN** a supported FX2 board is connected
- **THEN** it appears in the list before the demo device, with driver `fx2lafw`

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

