# Spec Delta

## MODIFIED Requirements

### Requirement: Start a capture
Starting a capture SHALL take a device id, a sample rate, a sample limit (0 meaning run until stopped), optional trigger terms, a pre-trigger fraction (default 0.1) used when there is a sample limit, and a pre-trigger time in seconds (default 0.1) used when there is none. Starting SHALL stop any capture already running, and SHALL replace the current capture with a new, empty one sized to the device's channel count.

#### Scenario: Unknown device
- **WHEN** a capture is started with a device id that matches no driver
- **THEN** the start fails with "Unknown device <id>"

#### Scenario: New capture replaces old
- **WHEN** a capture is started while previous data is shown
- **THEN** the previous data is discarded and the capture id increases

#### Scenario: Pre-trigger time omitted
- **WHEN** a triggered capture with no sample limit is started without a pre-trigger time
- **THEN** it keeps 100 ms of signal before the trigger, within the memory cap
