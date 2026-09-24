# Spec Delta

## MODIFIED Requirements

### Requirement: Device selection
On launch, and every 3 seconds while no capture is in progress, the UI SHALL refresh the device list. If the selected device disappears, it SHALL remain selected and be shown as disconnected in the device picker, and Start SHALL be disabled with a message that the device isn't connected. If a device with the same USB vendor and product id later reappears, on any USB port, while the disconnected device is still selected, it SHALL be selected again automatically. Selecting a device, whether by the user or by this automatic reselection, SHALL keep the current sample rate if the device supports it, and otherwise use the device's default rate; it SHALL reset the channel list if the channel count differs. If the user selects a different device while the selected one is disconnected, that selection SHALL replace it, and the disconnected device SHALL NOT be reselected if it later reappears.

#### Scenario: Board plugged in
- **WHEN** an FX2 board is plugged in while the demo device is selected
- **THEN** the board appears in the device picker within about 3 seconds and the demo stays selected

#### Scenario: Selected board unplugged
- **WHEN** the selected FX2 board is unplugged
- **THEN** it stays selected, the device picker shows it as disconnected, and Start is disabled with a message that the device isn't connected

#### Scenario: Same board replugged
- **WHEN** a board with the same vendor and product id as the selected, disconnected board is plugged into any USB port
- **THEN** it is selected again automatically and Start is enabled

#### Scenario: User picks another device while disconnected
- **WHEN** the user selects a different device while the previously selected board is disconnected
- **THEN** the newly picked device becomes selected, and the previously selected board is not reselected if it later reappears
