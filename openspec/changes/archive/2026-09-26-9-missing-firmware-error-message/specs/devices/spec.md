# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Firmware readiness note
For an FX2 board that is not yet running fx2lafw firmware, the device entry SHALL carry a note: "Firmware will be uploaded on first capture" if the matching `.fw` file was found, or "Needs <file> in a firmware folder" if it was not. When the file was not found, the device entry SHALL also report the missing file's name in a separate field, so the UI does not have to read the note. A board already running fx2lafw SHALL have no note and no missing file.

#### Scenario: Firmware file missing
- **WHEN** a bare FX2 board is listed and its firmware file is in none of the firmware folders
- **THEN** its note names the missing `.fw` file
- **AND** its missing-firmware field holds the same file name

#### Scenario: Firmware file found
- **WHEN** a bare FX2 board is listed and its firmware file is in a firmware folder
- **THEN** its note is "Firmware will be uploaded on first capture" and its missing-firmware field is empty

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
