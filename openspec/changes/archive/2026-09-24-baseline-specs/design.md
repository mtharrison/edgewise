## Context

See proposal.md (Why). The specs were written by reading all of `crates/logic-core`, `crates/logic-node`, `src/main`, `src/preload` and `src/renderer` at commit `6ec40f2`. The only existing tests are Rust unit tests in `logic-core` (summary trees, edge search, trigger, `.sr` round trip, each decoder, the demo pattern, FX2 start commands).

## Goals / Non-Goals

**Goals:**
- Specs describe behavior a user or the UI can observe, so internals can be rewritten without spec changes.
- Capability boundaries match how future work will be grouped in the backlog (one epic per capability).

**Non-Goals:**
- Fixing any behavior, even where it looks wrong.
- Adding tests. Coverage gaps are listed below as follow-ups.
- Specifying visual styling (colours, fonts, exact pixel sizes other than behavior-defining thresholds).

## Decisions

**Seven capabilities, split by what changes together.**
`devices` (what can be captured from) is separate from `acquisition` (running a capture), since new hardware support shouldn't touch capture semantics. `trigger` is its own capability because it has its own UI and rules. `waveform-view` holds all timeline interaction; `app-shell` holds everything around it (menus, shortcuts, bridge, status bar). Alternative considered: one `ui` capability. Rejected because it would be so large that every UI change would modify it.

**Record behavior, not defects.**
Where the code looks like a bug, the spec leaves the detail out and it appears in Follow-ups instead. Alternative: specify the buggy behavior exactly. Rejected because it would make a bug fix look like a requirement change.

**UI-visible defaults, not engine defaults.**
The engine's built-in decoder defaults differ from the defaults the UI sends. Only the UI's are observable, so specs don't pin either; the UI defaults match the demo device pin-out.

**Concrete numbers only where users depend on them.**
Sample rates, the 5 s firmware wait, the 1 s stall timeout, zoom limits and the 3 s device rescan are specified. Internal sizes (chunk size, summary-tree fan-out, USB transfer sizes) are not.

## Risks / Trade-offs

- [A spec misreads the code] → Task 2 re-checks each requirement against its source before archiving.
- [Specs are too detailed and turn every tweak into a spec change] → Styling and internal constants are excluded; revisit granularity after the first few changes.
- [Specs drift from code] → The workflow archives each change's deltas in the same PR as the code, so `main` specs match `main` code.

## Follow-ups (candidate backlog issues)

Found while reading the code; not fixed here.

1. **Wrong hint in firmware error.** The missing-firmware error says "(see Settings)", but there is no Settings screen; the folder is under File → Open Firmware Folder.
2. **Trigger cycle skips "Any edge".** Clicking a channel's trigger button cycles none → rising → falling → high → low; `edge` is only reachable from the popover.
3. **Pre-trigger ignored for "Until stopped".** With no sample limit, the pre-trigger buffer is fixed at 1,000,000 samples regardless of the slider.
4. **Cmd/Ctrl+0 leaves follow mode on.** The `F` key turns follow mode off before fitting; the menu's Zoom to Fit does not, so the view keeps re-fitting during a capture.
5. **Pre-trigger range mismatch.** The slider stops at 90%; the engine accepts up to 99%.
6. **Test gaps.** No tests for: UART parity and framing errors, SPI modes 1–3, VCD export, dense annotation merging, device stall handling, measurement, or any UI behavior.
