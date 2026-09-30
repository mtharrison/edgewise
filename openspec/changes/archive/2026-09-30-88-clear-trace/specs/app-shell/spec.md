# Spec Delta

## ADDED Requirements

### Requirement: Clear the capture
The top bar SHALL offer a Clear button next to the capture button. It SHALL be an icon-only button styled like the open-file button, so it is less prominent than the capture button, with a "Clear capture" tooltip. It SHALL be disabled while a capture is in progress and when there are no samples. Pressing it SHALL open a confirmation dialog titled "Clear the capture?" that says the captured samples will be discarded, with Clear and Cancel buttons, where Cancel is the default. Choosing Clear SHALL clear the capture: the waveform SHALL show the empty state, the status bar SHALL show Ready with no sample count, and the time markers, hover measurement and decoder annotations SHALL be removed. The capture settings, channel settings and configured decoders SHALL be kept. Choosing Cancel SHALL change nothing.

#### Scenario: Clear after a demo capture
- **WHEN** the user captures from the demo device, presses Clear and chooses Clear in the dialog
- **THEN** the waveform shows "No capture yet", the status bar shows Ready with no sample count, and no new capture starts

#### Scenario: Cancel the clear
- **WHEN** the user presses Clear and chooses Cancel
- **THEN** the capture, markers and status bar are unchanged

#### Scenario: Decoders survive a clear
- **WHEN** a UART decoder is configured, a capture shows its annotations, and the user clears the capture
- **THEN** the decoder is still listed in the Analyzers panel with its settings, and no annotations are shown

#### Scenario: Nothing to clear
- **WHEN** the app has just launched with no capture, or a capture is in progress
- **THEN** the Clear button is disabled

## MODIFIED Requirements

### Requirement: Restricted engine bridge
The UI SHALL reach the engine only through an allow-list of methods: list devices, rescan devices, `sigrok-cli` status, start, stop, clear, status, render, samples, measure, find edge, burst at, add, update and remove decoders, decode, decoder rows, annotations, annotation page, annotation index, load, save and export VCD. Any other method name SHALL be rejected with "Unknown engine method <name>". File dialogs, opening the firmware folder and confirming a clear SHALL be separate, dedicated calls.

#### Scenario: Disallowed call
- **WHEN** the UI calls an engine method that is not on the allow-list
- **THEN** the call fails with "Unknown engine method <name>" and nothing runs

### Requirement: Top bar
The top bar SHALL offer a device picker with a rescan button, a sample-rate picker limited to the device's rates, a duration picker (1 ms, 10 ms, 100 ms, 500 ms, 1 s, 2 s, 5 s, 10 s, 30 s, or Until stopped) showing each option's sample count, the trigger chip, the selected device's note, an open-file button, a clear button, and a capture button. These pickers SHALL be disabled while a capture is in progress. The capture button SHALL show Start, Stop, Armed while waiting for a trigger, or the progress message while starting, and SHALL fill in proportion to progress towards the sample limit.

#### Scenario: Progress fill
- **WHEN** a 1 s capture is half complete
- **THEN** the capture button is half filled

### Requirement: Empty state
With no samples and no running capture, the waveform SHALL show "No capture yet" (or "Waiting for trigger…" while armed) and a hint to press Space to start or Cmd+O to open a `.sr` file. This includes after the capture is cleared.

#### Scenario: First launch
- **WHEN** the app starts
- **THEN** the waveform shows "No capture yet" with the start and open hints

#### Scenario: After a clear
- **WHEN** the user clears a capture
- **THEN** the waveform shows "No capture yet" with the start and open hints
