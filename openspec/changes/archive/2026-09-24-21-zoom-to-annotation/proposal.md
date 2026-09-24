## Why

Delivers #21 (epic: Waveform view, capability `waveform-view`).

To look at one decoded packet today, the user has to scroll-zoom and drag-pan until it fills the view. With traffic arriving periodically (for example, a UART message every second), this is slow and repetitive. A single action should frame the packet.

## What Changes

- Holding Cmd (macOS) or Ctrl (Windows and Linux) over a decoder row highlights the annotation under the pointer.
- Cmd/Ctrl+click on a highlighted annotation zooms and pans so that it fills the plot width, with a small margin on each side. This turns follow mode off, like other manual zooms.
- When zoomed out, closely spaced annotations are drawn as merged blocks. Cmd/Ctrl+click on a merged block frames the whole block, so a burst of bytes (a "packet") can be framed in one click and then refined by clicking again.
- Cmd/Ctrl+click on empty space does nothing.
- The status bar's shortcut hints mention the new action.

**Non-goals:**
- Grouping annotations into packets by idle time or protocol framing. Merged blocks give this for free when zoomed out; a real "packet" concept can be a later change.
- Zooming to a pulse on a channel row. Only decoder rows are affected.
- Changing plain click, which still selects the annotation in the decoded-data table.
- Animating the zoom.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `waveform-view`: adds a requirement for framing an annotation with Cmd/Ctrl+click.

## Impact

- `src/renderer/src/components/Waveform.tsx` (pointer and modifier handling), `draw.ts` (highlight), `actions.ts` (zoom to a sample range), `StatusBar.tsx` (hint).
- Adds Vitest as a dev dependency for renderer unit tests; `npm test` runs it after the Rust tests.
