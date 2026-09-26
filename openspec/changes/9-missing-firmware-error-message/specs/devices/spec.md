# Spec Delta

## MODIFIED Requirements

### Requirement: Firmware upload
When a capture starts on a board without fx2lafw firmware, the system SHALL upload the matching firmware to the board's RAM, report "Uploading firmware…" as progress, wait up to 5 seconds for the board to re-enumerate, and then continue the capture. Only fx2lafw firmware major version 1 SHALL be accepted. If the matching firmware file is in none of the firmware folders, the capture SHALL fail with a message that names the missing file and tells the user to put it in the folder opened by File → Open Firmware Folder.

#### Scenario: Upload succeeds
- **WHEN** a capture starts on a bare board whose firmware file is available
- **THEN** the status message shows "Uploading firmware…" and the capture proceeds once the board re-enumerates

#### Scenario: Firmware file missing
- **WHEN** a capture starts on a bare board whose firmware file is in none of the firmware folders
- **THEN** the capture ends in state `error` with the message "Firmware <file> not found. Download sigrok-firmware-fx2lafw and copy the .fw files into the folder opened by File → Open Firmware Folder."
- **AND** the message does not mention a Settings screen

#### Scenario: Board does not come back
- **WHEN** the board does not re-enumerate within 5 seconds after upload
- **THEN** the capture fails with "Device did not re-enumerate after firmware upload"

#### Scenario: Wrong firmware version
- **WHEN** the board reports an fx2lafw major version other than 1
- **THEN** the capture fails with "Unsupported fx2lafw firmware version <major>.x"
