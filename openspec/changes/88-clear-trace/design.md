# Design

## Context

See proposal.md for why. Right now the engine replaces its capture in two places: `start()` swaps in an empty capture and opens a device, and `load()` swaps in a file's capture. Both go through `replace_capture()`, which bumps the capture id. In the UI, `pollStatus()` treats a new capture id as a new capture and re-runs every decoder on it. The waveform and overview cache on `captureId:samples` and draw nothing when there are 0 samples. `Waveform.tsx` already shows the "No capture yet" empty state when there are no samples and nothing is running. The only confirmation dialog so far is the firmware prompt, a native `dialog.showMessageBox` in the main process that the renderer reaches through a dedicated IPC call (`firmware:missing`).

## Goals / Non-Goals

**Goals:**
- Clearing reuses the existing capture-replacement path, so the waveform, overview, decoders and data table reset the way they already do for a new capture.
- The confirmation is a native dialog, consistent with the firmware prompt, and UI checks can stub it.

**Non-Goals:**
- A general confirmation service. There is one dedicated call for this dialog only.

## Decisions

- **The engine does the clear, not the UI.** `Engine::clear()` does nothing while an acquisition is busy (`starting`, `waiting` or `running`). Otherwise it calls `replace_capture()` with an empty `Capture` that keeps the current capture's sample rate and channel count, and sets the status to `Idle` with no message and no `pretrigger_kept`. *Alternative:* hide the trace in the renderer only. Rejected because status, save/export and decoders would still see the old samples.
- **The busy check lives in the engine as well as the UI.** Space and future menu paths can't then clear a live capture, and the Rust test can cover it.
- **Decoders are re-run, not removed.** Changing the capture id makes `pollStatus()` re-decode every decoder. On an empty capture that gives empty rows, so annotations and the data table empty out and decoder configs stay. No new decoder code is needed.
- **Confirmation goes through a dedicated `confirmClear` IPC**, which returns a boolean and uses `dialog.showMessageBox` with `buttons: ['Clear', 'Cancel']`, `defaultId: 1`, `cancelId: 1`. *Alternative:* `window.confirm`. Rejected because it can't be styled like the rest of the app's dialogs, and Playwright handles it differently from the stubbed native dialogs the existing checks use.
- **Renderer action `clearCapture()`**: return if busy or if there are 0 samples, then `await bridge.confirmClear()`, then `engine.clear()`, reset `markers`, `measurement`, `hover` and the view (to its launch zoom, since fitting 0 samples zooms to nanoseconds), then `pollStatus()`.
- **Button**: a `Trash2` lucide icon in an `icon-btn ghost` button placed just before `CaptureButton`, titled "Clear capture".

## Risks / Trade-offs

- [Clear races with a start already in flight from the renderer] → The engine ignores `clear()` while busy, and the button is disabled while busy.
- [The pickers' channel count follows the device again after a clear, not the cleared capture] → This matches first launch, where `pollStatus` only overlays channels when samples > 0. It is the intended behaviour.
