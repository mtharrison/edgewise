# Spec Delta

## MODIFIED Requirements

### Requirement: Restricted engine bridge
The UI SHALL reach the engine only through an allow-list of methods: list devices, rescan devices, `sigrok-cli` status, start, stop, status, render, samples, measure, find edge, burst at, add, update and remove decoders, decode, decoder rows, annotations, annotation page, annotation index, load, save and export VCD. Any other method name SHALL be rejected with "Unknown engine method <name>". File dialogs and opening the firmware folder SHALL be separate, dedicated calls.

#### Scenario: Disallowed call
- **WHEN** the UI calls an engine method that is not on the allow-list
- **THEN** the call fails with "Unknown engine method <name>" and nothing runs

## ADDED Requirements

### Requirement: Device scanning
At launch, and when the user presses the rescan button, the UI SHALL ask for a full device scan, which includes the sigrok scan, and SHALL use the resulting list as a device refresh. The regular 3-second refresh SHALL only list devices and SHALL NOT start a sigrok scan. The app SHALL stay responsive while a scan runs, and the rescan button SHALL be disabled until the scan finishes. At launch, remembered capture settings SHALL be fitted to the list from the full scan, so a remembered sigrok device that is connected is selected. When the app is started with the `EDGEWISE_SIGROK_CLI` environment variable set, its value SHALL be given to the engine as the `sigrok-cli` path.

#### Scenario: Rescan finds a new sigrok device
- **WHEN** a DSLogic is plugged in with `sigrok-cli` installed and the user presses the rescan button
- **THEN** the DSLogic appears in the device picker once the scan finishes, and the selected device does not change

#### Scenario: Sigrok device plugged in without a rescan
- **WHEN** a DSLogic is plugged in and the user does not press rescan
- **THEN** it does not appear on the 3-second refresh

#### Scenario: Remembered sigrok device at launch
- **WHEN** the app restarts with a remembered sigrok device still connected
- **THEN** that device is selected after the launch scan, with its remembered settings

#### Scenario: Window stays responsive during a slow scan
- **WHEN** a rescan takes several seconds
- **THEN** the waveform can still be panned and zoomed, and the rescan button is disabled until the scan finishes
