# Design

## Context

See proposal.md - Why. `Feeder` (`crates/logic-core/src/trigger.rs`) keeps the pre-trigger backlog in a `VecDeque<u8>` while armed. On a hit it `drain(..).collect()`s the ring into a `Vec` (copy 1), extends it with the part of the current block before the hit (possible realloc, copy 2), slices off the excess, then calls `Capture::append` (copy 3, plus building every chunk's summary tree). All of this runs inside the driver's sink, on the acquisition thread, before the transfer is resubmitted. The `VecDeque` also keeps its capacity after the drain, so the backlog's memory is held three to four times over at the peak.

`Capture` (`crates/logic-core/src/capture.rs`) stores samples in `Arc<Chunk>`s of `CHUNK` (2^20) samples, each with its own summary tree built on append. Full chunks are immutable and shared with snapshots. Sample `i` lives in chunk `i >> CHUNK_BITS` at local index `i & (CHUNK - 1)`.

## Goals / Non-Goals

**Goals:**
- Make the trigger-hit push cost independent of pre-trigger size (target ≤ 10 ms at 90% of 10 s at 24 MHz).
- Hold the backlog in memory once, not several times.
- A repeatable benchmark for no-trigger and trigger-hit ingest.

**Non-Goals:**
- See proposal.md - Non-goals.

## Decisions

- **Build the ring from capture chunks.** While armed, `Feeder` appends to its own `Vec<Arc<Chunk>>` (or a private `Capture` it owns) using the same append path as the capture, so summary trees are built as data arrives, at the same per-push cost as normal ingest. When the samples in the ring exceed `pre_bytes` by a whole chunk or more, the oldest chunk is dropped. The ring therefore holds at most `pre_samples + CHUNK` samples, which is the "fixed margin" in the spec (1 MB at 8 channels, 2 MB at 16).
  - Alternative considered: keep the flat ring and append the backlog to the capture a slice at a time over later pushes, or on a helper thread. Rejected: it still copies the backlog, the live data arriving meanwhile has to be queued behind it (more memory), and the UI sees the capture fill late.
- **Give `Capture` a start offset.** The kept backlog rarely starts on a chunk boundary. Rather than shifting data, `State` and `Snapshot` get an `origin: usize` (0 ≤ origin < CHUNK), the local index in chunk 0 of capture sample 0. Public indices stay 0-based; internally `Snapshot` maps sample `i` to physical `i + origin` in `get`, `summary`, `next_change`, `prev_change` (and so `burst_at`), `render` and `samples`, and `raw_chunks` skips `origin * unitsize` bytes of the first chunk. Summaries of chunk 0 already work on arbitrary local ranges, so no tree changes are needed. `len` stays the logical sample count.
- **Hand over with one call.** New `Capture::adopt(chunks, origin)` (name to settle in implementation) replaces the empty capture's chunk list and origin under the lock, moving the `Vec<Arc<Chunk>>`; cost is O(chunks), about 200 pointer moves for 216 MB. On a hit, `Feeder` first appends `data[..cut]` to its ring, trims to `pre_bytes`, computes `origin` and `trigger_at` from the ring's sample count, adopts, sets the trigger, then writes `data[cut..]` normally. The sample limit accounting (`written`) counts the adopted samples.
- **Benchmark as a Cargo example.** `crates/logic-core/examples/ingest_bench.rs` feeds 480 KB blocks of 24 MHz 8-channel data through the real `Feeder` and `Capture` for 10 s of signal, with a second thread snapshotting and rendering at 60 Hz, and prints throughput and the slowest push for: no trigger; trigger at 5 s with 30% pre-trigger; trigger at 5 s with 90% pre-trigger. It also prints peak ring + capture bytes at the trigger point, counted from chunk sizes. Run on demand with `cargo run --release --example ingest_bench -p logic-core`; not part of `npm test`.

## Risks / Trade-offs

- Every `Snapshot` method must apply `origin` consistently; a missed spot shifts samples by up to a chunk → covered by running the existing brute-force summary, edge-search and burst tests against captures with a non-zero origin, plus a save/reopen round trip.
- Chunk 0 wastes up to `origin` samples of storage → bounded by one chunk, already inside the fixed margin.
- Summary building moves from the trigger step into the waiting phase, so waiting costs about what normal ingest costs, spread per push → well within the 40–130× headroom the issue measured.

## Follow-up issue candidates

- `save_sr` (`crates/logic-core/src/formats.rs`) does not store the trigger position, so a saved and reopened triggered capture loses its time origin. Not fixed here.
