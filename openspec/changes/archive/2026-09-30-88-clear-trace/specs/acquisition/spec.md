# Spec Delta

## ADDED Requirements

### Requirement: Clear a capture
Clearing SHALL discard the current capture's samples, replace it with an empty capture, set the state to `idle` with no message, and change the capture id. Clearing SHALL NOT start a capture or open a device. It SHALL be ignored while a capture is `starting`, `waiting` or `running`.

#### Scenario: Clear after a finished capture
- **WHEN** a capture has finished in state `done` with samples, and it is cleared
- **THEN** the state is `idle`, the sample count is 0, the capture id has increased, and no device is opened

#### Scenario: Clear after a device failure
- **WHEN** a capture ended in state `error` with samples kept, and it is cleared
- **THEN** the state is `idle` with no message and the sample count is 0

#### Scenario: Clear during a capture
- **WHEN** clearing is requested while a capture is running
- **THEN** nothing changes and the capture keeps running

## MODIFIED Requirements

### Requirement: Acquisition states
The acquisition SHALL report exactly one of these states: `idle` (nothing captured since launch or since the capture was cleared), `starting` (device opening), `waiting` (armed, waiting for a trigger), `running` (samples being stored), `done` (finished or stopped), or `error` (the device failed).

#### Scenario: Untriggered capture
- **WHEN** a capture without trigger terms receives its first data
- **THEN** the state becomes `running`

#### Scenario: Triggered capture
- **WHEN** a capture with trigger terms receives its first data
- **THEN** the state becomes `waiting`, and becomes `running` when the trigger fires
