# capture-files Specification

## Purpose
Moves captures in and out of Edgewise: opening and saving sigrok session (`.sr`) files for use with PulseView and sigrok tools, and exporting VCD for waveform viewers.
## Requirements
### Requirement: Open sigrok sessions
The system SHALL open a `.sr` file and replace the current capture with its contents. It SHALL read the sample rate, channel count, sample width (unitsize) and channel names from the file's metadata, defaulting to 1 MHz, 8 channels, 1 byte and `D<n>` names when missing. It SHALL keep at most 16 channels. Opening SHALL stop any running capture and leave the state `done`. The channel labels SHALL take the file's channel names, and the view SHALL fit the whole capture.

#### Scenario: Round trip
- **WHEN** a 3,000,000-sample 24 MHz capture with named channels is saved as `.sr` and opened again
- **THEN** the sample rate, sample count, sample values and channel names are identical

#### Scenario: Unreadable file
- **WHEN** the user opens a file that is not a valid `.sr` archive
- **THEN** a notification shows "Opening <path>: <reason>" and the current capture is unchanged

### Requirement: Save sigrok sessions
The system SHALL save the current capture as a sigrok session, format version 2, with the sample rate, channel count, unitsize and current channel names, so that sigrok tools can open it. Saving SHALL be refused with "Nothing captured yet" when the capture is empty. On success, the UI SHALL show "Saved <filename>".

#### Scenario: Save with renamed channels
- **WHEN** the user renames D0 to "TX" and saves
- **THEN** the file's first channel is named "TX"

### Requirement: Export VCD
The system SHALL export the current capture as a Value Change Dump with a 1 ps timescale, one 1-bit wire per channel named after its label (spaces replaced by underscores), the initial value of every channel at time 0, one entry for each later sample where any channel changes (listing only the channels that changed), and a final timestamp at the end of the capture. Export SHALL be refused with "Nothing captured yet" when the capture is empty.

#### Scenario: Export timing
- **WHEN** a capture at 1 MHz has a single change at sample 5
- **THEN** the VCD has entries at `#0` and `#5000000`, and a final timestamp for the capture's length

### Requirement: File dialogs
Open and save SHALL use native file dialogs filtered to `.sr` (sigrok session) or `.vcd` (Value Change Dump), with a default save name of `capture.sr` or `capture.vcd`. Cancelling a dialog SHALL do nothing.

#### Scenario: Cancel save
- **WHEN** the user cancels the save dialog
- **THEN** no file is written and no notification is shown

