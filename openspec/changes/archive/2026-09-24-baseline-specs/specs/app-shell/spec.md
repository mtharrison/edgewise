## Purpose

Provides the desktop app around the engine: the window, menus, keyboard shortcuts, status bar and notifications, and the restricted bridge through which the UI reaches the engine.

## ADDED Requirements

### Requirement: Restricted engine bridge
The UI SHALL reach the engine only through an allow-list of methods: list devices, start, stop, status, render, samples, measure, find edge, add, update and remove decoders, decode, decoder rows, annotations, annotation page, annotation index, load, save and export VCD. Any other method name SHALL be rejected with "Unknown engine method <name>". File dialogs and opening the firmware folder SHALL be separate, dedicated calls.

#### Scenario: Disallowed call
- **WHEN** the UI calls an engine method that is not on the allow-list
- **THEN** the call fails with "Unknown engine method <name>" and nothing runs

### Requirement: Menus
The File menu SHALL offer Open… (Cmd/Ctrl+O), Save As… (Cmd/Ctrl+S), Export VCD… (Cmd/Ctrl+E) and Open Firmware Folder. The Capture menu SHALL offer Start / Stop (Cmd/Ctrl+R) and Zoom to Fit (Cmd/Ctrl+0). Standard Edit, View and Window menus SHALL be present, plus the app menu on macOS.

#### Scenario: Open firmware folder
- **WHEN** the user chooses File → Open Firmware Folder
- **THEN** the app's user firmware folder opens in the system file manager

### Requirement: Keyboard shortcuts
Space SHALL start or stop a capture. Shortcuts SHALL be ignored while typing in a text field, select or text area, and plain-key shortcuts SHALL be ignored while Cmd or Ctrl is held. The status bar SHALL list the main shortcuts.

#### Scenario: Typing a channel name
- **WHEN** the user types a space while renaming a channel
- **THEN** the space goes into the name and no capture starts

### Requirement: Top bar
The top bar SHALL offer a device picker with a rescan button, a sample-rate picker limited to the device's rates, a duration picker (1 ms, 10 ms, 100 ms, 500 ms, 1 s, 2 s, 5 s, 10 s, 30 s, or Until stopped) showing each option's sample count, the trigger chip, the selected device's note, an open-file button, and a capture button. These pickers SHALL be disabled while a capture is in progress. The capture button SHALL show Start, Stop, Armed while waiting for a trigger, or the progress message while starting, and SHALL fill in proportion to progress towards the sample limit.

#### Scenario: Progress fill
- **WHEN** a 1 s capture is half complete
- **THEN** the capture button is half filled

### Requirement: Device selection
On launch, and every 3 seconds while no capture is in progress, the UI SHALL refresh the device list. If the selected device disappears, the first listed device SHALL be selected. Selecting a device SHALL keep the current sample rate if the device supports it, and otherwise use the device's default rate. It SHALL reset the channel list if the channel count differs.

#### Scenario: Board plugged in
- **WHEN** an FX2 board is plugged in while the demo device is selected
- **THEN** the board appears in the device picker within about 3 seconds and the demo stays selected

### Requirement: Status bar and notifications
The status bar SHALL show the acquisition state (Ready, Starting, Waiting for trigger, Capturing, Done, Error), and, once samples exist, the sample count, capture duration, sample rate and time per grid division. Errors from actions and failed captures SHALL appear as a notification in the status bar for 4 seconds.

#### Scenario: Capture error
- **WHEN** a capture ends in the `error` state with a message
- **THEN** the message appears as a notification in the status bar

### Requirement: Empty state
With no samples and no running capture, the waveform SHALL show "No capture yet" (or "Waiting for trigger…" while armed) and a hint to press Space to start or Cmd+O to open a `.sr` file.

#### Scenario: First launch
- **WHEN** the app starts
- **THEN** the waveform shows "No capture yet" with the start and open hints

### Requirement: Automation hook for development
When the `EDGEWISE_CDP_PORT` environment variable is set, the app SHALL expose the Chrome DevTools Protocol on that port so automated UI checks can drive it.

#### Scenario: Automated UI check
- **WHEN** the app is launched with `EDGEWISE_CDP_PORT=9333`
- **THEN** a DevTools client can connect on port 9333
