## Context

See proposal.md (Why). #21 added modifier tracking, a highlight and `frameAnnotation` for decoder rows (`Waveform.tsx`, `draw.ts`, `actions.ts`, pure maths in `view.ts`). Channel rows are drawn from per-pixel summaries (`engine.render`) or raw samples when zoomed far in, so the renderer never holds a channel's edges. The Rust capture (`capture.rs`) keeps a summary tree per chunk and has `next_change` / `prev_change`, which skip idle stretches quickly; `findEdge` (used by `[` / `]`) wraps them.

## Goals / Non-Goals

**Goals:**
- A burst extends past the view's edges when the data does, so framing gets the whole burst, not the visible part.
- Finding a burst stays fast on every pointer move, including bursts with millions of transitions.

**Non-Goals:**
- UI-level automated tests. Highlight and click are checked by hand, as in #21.

## Decisions

**Search in the Rust core, not the renderer.**
New `Snapshot::burst_at(mask, sample, max_gap, tolerance, budget) -> Option<(u64, u64)>`, exposed as `burstAt(channel, sample, maxGap, tolerance)`. Returns the first and last transition of the burst, or none. Alternative: derive bursts from the per-pixel data already drawn. Rejected: it stops at the view's edges, and the drawn data is lossy when zoomed out.

**Algorithm.**
Find the previous transition `p` (at or before the pointer) and the next `n` (after it). If both exist and `n - p < max_gap`, the pointer is inside a burst; otherwise, if the pointer is within the pointer tolerance of `p` or `n`, start from that transition and its near neighbour; else return none. Then extend each end: from the current end `e`, look for any transition in `(e, e + max_gap)` using the last transition in that window (`prev_change` from `e + max_gap - 1`). If there is one, it becomes the new end; if not, the burst ends at `e`. Each step jumps nearly `max_gap` samples through dense data rather than one transition at a time. Backwards is symmetric with `next_change`. A lone transition (no neighbour within `max_gap`) is not a burst.

**Idle threshold in pixels.**
The renderer passes `maxGap = 8 px × samples-per-pixel` and a 2 px pointer tolerance (same as annotations). So a burst is what reads as one block at this zoom, and a second Cmd+click refines, matching #21's merged blocks. Alternative: a threshold derived from the channel's edge statistics (for example, a multiple of the median gap). Rejected: harder to predict, and costly on large captures.

**Search budget.**
`burst_at` stops extending after 10,000 steps per side and returns the extent found so far. Steps jump about `max_gap` each, so this only bites when zoomed far into a very long dense stretch (for example, a clock running the whole capture); framing then covers part of it.

**One request in flight, latest wins.**
Like hover measurement: on pointer move or modifier change over a channel row, request `burstAt`; if one is in flight, remember only the newest. The result is stored as the highlight `{ kind: 'burst', channel, start, end }` alongside #21's annotation highlight, and triggers a redraw. The highlight is dropped when the view changes or the pointer leaves the row.

**Click re-queries.**
A modified pointer-down on a channel row awaits `burstAt` at the click position, and frames the result if there is one, rather than trusting a highlight that may be stale by a frame. It never sets pointer capture or starts a pan.

**Shared framing action.**
Rename `frameAnnotation(start, end)` to `frameSpan(start, end)`; both rows use it, so margins and follow-off are identical.

**Highlight style.**
A translucent band in the channel's colour across the row, from burst start to end (clipped to the plot), with a brighter 1.5 px outline, and a pointer cursor over it.

## Risks / Trade-offs

- [The highlight arrives one engine round trip after the pointer moves] → Accepted; the search is a few summary-tree walks and is well under a frame for normal captures.
- [During a live capture a burst at the capture's end may still be growing] → Accepted; the highlight updates on the next pointer move or frame, and a click frames what exists now.
- [The budget can cut a very long dense stretch short] → Accepted; covered in Decisions. Plain zoom still works.

## Follow-ups (candidate backlog issues)

- Bursts across a group of channels (a bus), where a gap counts only if every channel in the group is idle.
