## Why

Edgewise has working features but no specs, so future changes have nothing to write deltas against. This change records what the app does today as the first set of living specs. Every later change then builds on an accurate baseline.

## What Changes

- Add seven capability specs that describe current, observable behavior, each grounded in the code as of commit `6ec40f2`.
- No application code changes. Where the code looks wrong or inconsistent, the spec does not encode the defect; it is listed in `design.md` as a follow-up issue instead.

## Capabilities

### New Capabilities
- `devices`: discovering capture sources (demo device, FX2 boards running fx2lafw), firmware lookup and upload, and supported sample rates.
- `acquisition`: starting and stopping a capture, sample limits, acquisition states and status reporting, and error handling that keeps captured data.
- `trigger`: software trigger conditions per channel, AND-combination, and pre-trigger retention.
- `decoders`: UART, I²C and SPI protocol decoding, annotation rows and classes, value formats, background re-decoding, and annotation queries.
- `capture-files`: opening and saving sigrok `.sr` sessions and exporting VCD.
- `waveform-view`: waveform and overview rendering, zoom, pan and fit, time markers, edge navigation, hover pulse measurement, channel labels, and the decoded-data table.
- `app-shell`: window, menu and keyboard shortcuts, status bar and notifications, and the restricted bridge between the UI and the engine.

### Modified Capabilities

None. No specs exist yet.

## Impact

- Adds `openspec/specs/<capability>/spec.md` for each capability above once archived.
- No code, API or dependency changes.
- Defines the vocabulary (capability names, requirement names) that backlog epics and later changes will reference.
