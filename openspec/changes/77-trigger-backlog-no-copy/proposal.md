# Proposal

## Why

Delivers #77. When a trigger fires, the acquisition thread copies the whole pre-trigger buffer into a new buffer and appends it to the capture in one step, before the USB transfer goes back to the device. That step takes longer the larger the pre-trigger: on an M5 Pro, a 10 s capture at 24 MHz with 90% pre-trigger (216 MB backlog) spends 127 ms in a single push, against 0.6 ms for normal ingest. The FX2 driver's 32 queued transfers cover about 640 ms, so a machine around five times slower, or a faster analyzer later, would overrun at the moment the trigger fires. The copy also briefly holds the backlog in memory two or more times.

## What Changes

- Keep the pre-trigger buffer in the same chunked form the capture stores, building the capture's summaries as samples arrive while waiting, instead of in one flat byte ring.
- When the trigger fires, hand those chunks to the capture as its first samples without copying them, so the time the trigger step takes no longer depends on the pre-trigger size.
- The capture can start part-way into its first chunk, so the kept pre-trigger samples still begin at sample 0 and the trigger position is unchanged.
- Chunks that fall out of the pre-trigger window while waiting are released, so memory while waiting and at the trigger point stays within the pre-trigger size plus at most one chunk.
- Add an on-demand ingest benchmark covering the no-trigger and trigger-hit cases, reporting throughput and the slowest single push; its numbers go in the PR.

### Non-goals

- The FX2 USB-side stalls tracked in #72.
- Changing how the trigger condition is matched, the pre-trigger fraction or time settings, or the 64 MB pre-trigger memory cap for captures with no sample limit.
- Making normal (untriggered) ingest faster.
- Running the benchmark in CI or failing a build on its numbers.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `trigger`: adds a requirement that firing the trigger does not hold up data from the device for longer than a fixed bound, whatever the pre-trigger size, and does not keep a second copy of the pre-trigger samples in memory.

## Impact

- `crates/logic-core/src/trigger.rs` (`Feeder`): the pre-trigger ring becomes a list of capture chunks; the trigger-hit path hands them over instead of draining and copying.
- `crates/logic-core/src/capture.rs`: `Capture` gains a way to take ready-built chunks and a start offset into its first chunk; `Snapshot` indexing, summaries, edge search, `render`, `samples` and `raw_chunks` account for that offset.
- `crates/logic-core/src/formats.rs`: saving uses `raw_chunks`, which must skip the offset so saved files start at the first kept sample.
- New benchmark (`crates/logic-core/examples/ingest_bench.rs`), run with `cargo run --release --example ingest_bench -p logic-core`.
