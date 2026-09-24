# acquisition Specification

## Purpose
Runs a capture from a selected device into memory, reports its progress and state, and keeps whatever data was captured when a device fails.
## Requirements
### Requirement: Start a capture
Starting a capture SHALL take a device id, a sample rate, a sample limit (0 meaning run until stopped), optional trigger terms, and a pre-trigger fraction (default 0.1). Starting SHALL stop any capture already running, and SHALL replace the current capture with a new, empty one sized to the device's channel count.

#### Scenario: Unknown device
- **WHEN** a capture is started with a device id that matches no driver
- **THEN** the start fails with "Unknown device <id>"

#### Scenario: New capture replaces old
- **WHEN** a capture is started while previous data is shown
- **THEN** the previous data is discarded and the capture id increases

### Requirement: Acquisition states
The acquisition SHALL report exactly one of these states: `idle` (nothing captured since launch), `starting` (device opening), `waiting` (armed, waiting for a trigger), `running` (samples being stored), `done` (finished or stopped), or `error` (the device failed).

#### Scenario: Untriggered capture
- **WHEN** a capture without trigger terms receives its first data
- **THEN** the state becomes `running`

#### Scenario: Triggered capture
- **WHEN** a capture with trigger terms receives its first data
- **THEN** the state becomes `waiting`, and becomes `running` when the trigger fires

### Requirement: Sample limit
With a non-zero sample limit, the capture SHALL store exactly that many samples and then finish in state `done`. With a limit of 0, the capture SHALL run until stopped.

#### Scenario: Limit reached
- **WHEN** a capture with a limit of N samples has stored N samples
- **THEN** acquisition ends and the state is `done` with N samples

### Requirement: Stop a capture
Stopping SHALL end the acquisition, wait for the device to release, keep all samples captured so far, and leave the state `done`. Closing the last window SHALL also stop any running capture.

#### Scenario: Stop during an open-ended capture
- **WHEN** the user stops a capture that has no sample limit
- **THEN** the captured samples remain viewable and the state is `done`

### Requirement: Status reporting
The system SHALL report, on request: the state, a progress or error message, the number of stored samples, the sample rate, the channel count, the trigger sample position if any, a capture id that changes whenever the capture is replaced, whether any decoder is busy, and a decode generation counter that increases each time a decode completes.

#### Scenario: Live sample count
- **WHEN** status is requested repeatedly during a running capture
- **THEN** the sample count increases between requests

### Requirement: Keep data on device failure
If an FX2 board stops sending data for 1 second, or is disconnected, the acquisition SHALL end in state `error` with a message, and the samples captured so far SHALL be kept.

#### Scenario: Device stalls
- **WHEN** an FX2 board stops streaming mid-capture
- **THEN** the state is `error`, the message says "Device stopped sending after <n> samples", notes that captured data was kept, and suggests another cable, USB port or a lower sample rate

#### Scenario: Device unplugged
- **WHEN** the board is unplugged during a capture
- **THEN** the state is `error` with the message "Device disconnected" and the captured samples remain

### Requirement: Channel storage
The system SHALL store up to 16 channels, one bit per channel per sample. Samples SHALL be addressable by index from 0 to the stored count minus one.

#### Scenario: 16-channel device
- **WHEN** a 16-channel board is captured
- **THEN** all 16 channels are stored and displayed

