# Spec Delta

## MODIFIED Requirements

### Requirement: Keep data on device failure
If an FX2 board or a sigrok device stops sending data for 1 second after it has started sending, or is disconnected, the acquisition SHALL end in state `error` with a message, and the samples captured so far SHALL be kept.

#### Scenario: Device stalls
- **WHEN** an FX2 board stops streaming mid-capture
- **THEN** the state is `error`, the message says "Device stopped sending after <n> samples", notes that captured data was kept, and suggests another cable, USB port or a lower sample rate

#### Scenario: Device unplugged
- **WHEN** the board is unplugged during a capture
- **THEN** the state is `error` with the message "Device disconnected" and the captured samples remain

#### Scenario: Sigrok device goes silent
- **WHEN** a sigrok device has sent samples and then sends nothing for 1 second
- **THEN** `sigrok-cli` is ended, the state is `error`, the message says "Device stopped sending after <n> samples" and notes that captured data was kept, and the captured samples remain viewable

#### Scenario: Sigrok device unplugged
- **WHEN** a sigrok device is unplugged during a capture
- **THEN** the state is `error` with a message and the captured samples remain viewable
