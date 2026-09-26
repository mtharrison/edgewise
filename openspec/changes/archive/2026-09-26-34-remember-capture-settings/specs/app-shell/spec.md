## ADDED Requirements

### Requirement: Remembered capture settings
The app SHALL remember the capture settings whenever they change and restore them the next time it launches. The remembered settings SHALL be the selected device, sample rate, duration, pre-trigger, each channel's name, colour, visibility and trigger condition, and the decoders with their settings and visibility. If the remembered device is connected at launch (or, for an FX2 board, a board of the same model), it SHALL be selected; otherwise the first listed device SHALL be selected. The other settings SHALL be kept where they still apply to the selected device: the sample rate only if the device supports it (otherwise the device's default rate), channel settings only for channels the device has (other channels get default settings), and decoders only if every channel they read exists on the device. Opening a `.sr` file SHALL still take channel names from the file. If the saved settings are missing or unreadable, the app SHALL start with the default settings.

#### Scenario: Restart with the same board
- **WHEN** the user selects a board, sets 24 MHz, 1 s, 30% pre-trigger, renames D0 to "TX", hides D7, sets a rising trigger on D2, adds a UART decoder on D0 at 9600 baud, and restarts the app with the board still connected
- **THEN** the board is selected with 24 MHz, 1 s and 30% pre-trigger, D0 is named "TX", D7 is hidden, D2 has a rising trigger, and a UART decoder on D0 at 9600 baud is listed in the Analyzers panel

#### Scenario: Remembered device not connected
- **WHEN** the app restarts and the remembered board is not connected, and the demo device is the first listed device
- **THEN** the demo device is selected, the remembered sample rate is kept if the demo device supports it and the demo device's default rate is used otherwise, and the channel names, trigger conditions and decoders that fit its channels are restored

#### Scenario: Fewer channels than remembered
- **WHEN** settings were remembered with a 16-channel device and the app restarts with only an 8-channel device available
- **THEN** D0–D7 keep their remembered settings, and a decoder that reads D12 is not restored

#### Scenario: Opening a file after restore
- **WHEN** remembered channel names have been restored and the user opens a `.sr` file with its own channel names
- **THEN** the channel labels show the file's channel names

#### Scenario: Unreadable saved settings
- **WHEN** the saved settings cannot be read
- **THEN** the app starts with the default settings and no error is shown

### Requirement: Reset capture settings
The Capture menu SHALL offer Reset Capture Settings. Choosing it SHALL select the first listed device and set 20 MHz if the device supports it (otherwise the device's default rate), a 100 ms duration, 10% pre-trigger, `D<n>` channel names with default colours, all channels visible, no trigger conditions and no decoders, and SHALL replace the remembered settings with these defaults. It SHALL be ignored while a capture is in progress and SHALL NOT change the current capture.

#### Scenario: Reset after customising
- **WHEN** the user has renamed channels, set a trigger and added decoders, then chooses Capture → Reset Capture Settings and restarts the app
- **THEN** the channels are named `D0`, `D1`, …, no trigger is set, no decoders are listed, and duration is 100 ms, both right after the reset and after the restart

## MODIFIED Requirements

### Requirement: Menus
The File menu SHALL offer Open… (Cmd/Ctrl+O), Save As… (Cmd/Ctrl+S), Export VCD… (Cmd/Ctrl+E) and Open Firmware Folder. The Capture menu SHALL offer Start / Stop (Cmd/Ctrl+R), Zoom to Fit (Cmd/Ctrl+0) and Reset Capture Settings. Standard Edit, View and Window menus SHALL be present, plus the app menu on macOS.

#### Scenario: Open firmware folder
- **WHEN** the user chooses File → Open Firmware Folder
- **THEN** the app's user firmware folder opens in the system file manager

#### Scenario: Reset from the Capture menu
- **WHEN** the user opens the Capture menu
- **THEN** it lists Start / Stop, Zoom to Fit and Reset Capture Settings
