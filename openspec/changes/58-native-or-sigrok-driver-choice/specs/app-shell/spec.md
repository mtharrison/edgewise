# Spec Delta

## MODIFIED Requirements

### Requirement: Restricted engine bridge
The UI SHALL reach the engine only through an allow-list of methods: list devices, rescan devices, `sigrok-cli` status, start, stop, status, render, samples, measure, find edge, burst at, add, update and remove decoders, decode, decoder rows, annotations, annotation page, annotation index, load, save and export VCD. Any other method name SHALL be rejected with "Unknown engine method <name>". File dialogs, opening the firmware folder, and choosing or clearing the `sigrok-cli` executable SHALL be separate, dedicated calls; the UI SHALL NOT be able to give the engine an arbitrary executable path except through the file picker of the choose call.

#### Scenario: Disallowed call
- **WHEN** the UI calls an engine method that is not on the allow-list
- **THEN** the call fails with "Unknown engine method <name>" and nothing runs

#### Scenario: Setting the sigrok-cli path directly
- **WHEN** the UI calls the engine's method for setting the `sigrok-cli` path through the engine bridge
- **THEN** the call fails with "Unknown engine method" and the path in use is unchanged

### Requirement: Device scanning
At launch, and when the user presses the rescan button, the UI SHALL ask for a full device scan, which includes the sigrok scan, and SHALL use the resulting list as a device refresh. The regular 3-second refresh SHALL only list devices and SHALL NOT start a sigrok scan. The app SHALL stay responsive while a scan runs, and the rescan button SHALL be disabled until the scan finishes. At launch, remembered capture settings SHALL be fitted to the list from the full scan, so a remembered sigrok device that is connected is selected. When the app is started with the `EDGEWISE_SIGROK_CLI` environment variable set, its value SHALL be given to the engine as the `sigrok-cli` path, in place of any executable the user chose in the Hardware section; otherwise the executable the user chose, if any, SHALL be given.

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

#### Scenario: Environment variable wins
- **WHEN** the user has chosen a `sigrok-cli` executable and the app is started with `EDGEWISE_SIGROK_CLI` set to another one
- **THEN** the Hardware section shows the one from `EDGEWISE_SIGROK_CLI`

## ADDED Requirements

### Requirement: Hardware section
The right panel SHALL have a Hardware section. It SHALL show the `sigrok-cli` found by the last full scan as its path and version, or "Not found" with a link that opens sigrok's download page in the system browser. It SHALL offer a Choose… button that opens a file picker for the `sigrok-cli` executable and, once an executable has been chosen, a button to go back to the automatic search. Choosing an executable, or going back to the automatic search, SHALL remember the choice across launches and run a full device scan, after which the section SHALL show the result. If the chosen file is not a working `sigrok-cli`, the section SHALL show "Not found" and keep the choice, so the user can see and change it. Cancelling the file picker SHALL change nothing. The section SHALL show the status while a scan runs as scanning, and its buttons SHALL be disabled while a scan or a capture is in progress. Reset Capture Settings SHALL NOT change the chosen executable.

#### Scenario: sigrok-cli found
- **WHEN** the app starts with `sigrok-cli` 0.7.2 on `PATH` and no executable chosen
- **THEN** the Hardware section shows its path and "0.7.2", and a Choose… button

#### Scenario: sigrok-cli not found
- **WHEN** the app starts and no `sigrok-cli` can be found
- **THEN** the Hardware section shows "Not found" with a link to sigrok's download page

#### Scenario: Choose another executable
- **WHEN** the user presses Choose…, picks a vendor build of `sigrok-cli`, and later restarts the app
- **THEN** after the scan, and again after the restart, the Hardware section shows the chosen path and its version, and devices from its sigrok scan are listed

#### Scenario: Back to automatic search
- **WHEN** an executable has been chosen and the user presses the button to go back to the automatic search
- **THEN** a scan runs, the section shows the `sigrok-cli` found by searching (or "Not found"), and on the next launch no executable is chosen

#### Scenario: Chosen file does not work
- **WHEN** the user chooses a file that is not a working `sigrok-cli`
- **THEN** after the scan the section shows "Not found" and still offers going back to the automatic search

#### Scenario: Cancel the file picker
- **WHEN** the user presses Choose… and closes the file picker without choosing
- **THEN** no scan runs and the section is unchanged

### Requirement: Driver choice
When the selected device can also be captured through `sigrok-cli`, the top bar SHALL show a Native / sigrok-cli choice next to the device picker, set to Native unless the user chose otherwise. When the selected device cannot be captured that way (no working `sigrok-cli`, the demo device, or a device found by the sigrok scan), no choice SHALL be shown and captures SHALL run natively. Starting a capture SHALL use the shown choice. The choice SHALL be remembered per device model (for an FX2 board, its USB vendor and product id) across launches, and selecting or reconnecting a board of that model SHALL show the remembered choice. The choice SHALL be disabled while a capture is in progress. The device picker, the device id, the remembered selected device and the behaviour when the board is unplugged and replugged SHALL be the same under either choice. Reset Capture Settings SHALL NOT change the remembered choices.

#### Scenario: FX2 board with sigrok-cli
- **WHEN** an FX2 board is selected and a working `sigrok-cli` with the `fx2lafw` driver was found
- **THEN** a Native / sigrok-cli choice is shown next to the device picker, set to Native

#### Scenario: No choice without sigrok-cli
- **WHEN** an FX2 board is selected and no `sigrok-cli` was found
- **THEN** no driver choice is shown

#### Scenario: No choice on the demo device
- **WHEN** the demo device is selected, with `sigrok-cli` installed
- **THEN** no driver choice is shown

#### Scenario: Capture through sigrok-cli
- **WHEN** the user selects sigrok-cli for an FX2 board and starts a 100 ms capture
- **THEN** the capture runs through `sigrok-cli`, ends with the same sample count a native capture would have, and the device picker still shows the board once under the same name

#### Scenario: Remembered per model
- **WHEN** the user selects sigrok-cli for a Saleae Logic clone, restarts the app, and plugs the same model into another USB port
- **THEN** the board is shown with sigrok-cli chosen

#### Scenario: Other models unaffected
- **WHEN** sigrok-cli is chosen for a Saleae Logic clone and a CWAV USBee AX is selected
- **THEN** the USBee AX is shown with Native chosen

#### Scenario: Locked during capture
- **WHEN** a capture is in progress on an FX2 board
- **THEN** the driver choice cannot be changed
