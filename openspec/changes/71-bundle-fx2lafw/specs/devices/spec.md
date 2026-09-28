## ADDED Requirements

### Requirement: Bundled fx2lafw firmware
Every installer (macOS, Linux and Windows) SHALL ship, in the app's bundled firmware folder, the `.fw` files from one pinned sigrok-firmware-fx2lafw release, including a file for every FX2 board the app supports. The same folder SHALL hold fx2lafw's license text and a note naming the release and linking to its matching source release. Building an installer SHALL fail if the downloaded release does not match the pinned one, or if the bundled firmware folder lacks any of these files.

#### Scenario: Fresh install with a bare board
- **WHEN** the app is installed on a machine with no sigrok firmware anywhere, its user firmware folder is empty, and a bare Saleae clone is plugged in
- **THEN** the board is listed with "Firmware will be uploaded on first capture" and no missing firmware file
- **AND** the first capture shows "Uploading firmware…" and succeeds without any dialog or user step

#### Scenario: License and source ship with the firmware
- **WHEN** a user opens the bundled firmware folder of an installed app
- **THEN** it contains fx2lafw's license text and a note linking to the source release that matches the shipped `.fw` files

#### Scenario: Download does not match the pinned release
- **WHEN** an installer is built and the downloaded firmware release does not match the pinned release
- **THEN** the build fails and no installer is produced

## MODIFIED Requirements

### Requirement: Firmware folders
The system SHALL search for firmware, in order, in: the app's user firmware folder (created at startup), the app's bundled firmware folder, the `sigrok-firmware` folder inside any installed PulseView app in `/Applications`, `/opt/homebrew/share/sigrok-firmware`, `/usr/local/share/sigrok-firmware`, `/usr/share/sigrok-firmware`, and `~/.local/share/sigrok-firmware`. Folders that do not exist SHALL be ignored. When more than one folder holds the file a board needs, the system SHALL use the one found first in this order.

#### Scenario: PulseView installed
- **WHEN** PulseView is installed in `/Applications` with its bundled firmware
- **THEN** Edgewise can upload firmware to a bare board without the user copying any files

#### Scenario: User firmware takes precedence
- **WHEN** the user firmware folder and the bundled firmware folder both hold the file a bare board needs
- **THEN** the firmware uploaded to the board is the copy from the user firmware folder
