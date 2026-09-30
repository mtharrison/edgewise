# Tasks

## 1. Benchmark first

- [x] 1.1 Add `crates/logic-core/examples/ingest_bench.rs` as described in design.md: 480 KB blocks, 24 MHz, 8 channels, 10 s, a 60 Hz snapshot-and-render thread; cases no trigger, trigger at 5 s with 30% and with 90% pre-trigger; print throughput, slowest single push and peak backlog bytes at the trigger point
- [x] 1.2 Run it on the current code with `cargo run --release --example ingest_bench -p logic-core` and record the baseline numbers for the PR

## 2. Capture start offset

- [ ] 2.1 Add an `origin` (local start index in chunk 0) to `Capture`'s state and `Snapshot`, and apply it in `get`, `summary`, `next_change`, `prev_change`, `render`, `samples` and `raw_chunks` (`crates/logic-core/src/capture.rs`)
- [ ] 2.2 Add a `Capture` method that takes a ready-built `Vec<Arc<Chunk>>` and an origin, replacing an empty capture's contents without copying
- [ ] 2.3 Extend the brute-force tests in `capture.rs` (summary, edge search, burst) to also run on a capture built with a non-zero origin, including an origin near the end of chunk 0 and data crossing into chunk 1
- [ ] 2.4 Add a `formats.rs` test: save and reopen a capture with a non-zero origin and check it starts at the first kept sample with the same samples

## 3. Chunked pre-trigger ring

- [ ] 3.1 Replace `Feeder`'s `VecDeque<u8>` ring with chunks built through the capture's append path, dropping the oldest chunk once the ring holds at least one chunk more than the pre-trigger size (`crates/logic-core/src/trigger.rs`)
- [ ] 3.2 On a trigger hit, append the part of the block before the hit to the ring, work out the origin and trigger position, hand the chunks to the capture, then write the rest of the block; keep the sample-limit count right
- [ ] 3.3 Keep the existing `rising_trigger_keeps_pretrigger` and `until_stopped_keeps_pretrigger_time` tests passing, and add tests for: a pre-trigger larger than one chunk with the trigger mid-chunk, a hit before the ring has filled (trigger position equals the buffered count), a hit in the very first block, 16-channel data, and a trigger with a sample limit where the kept samples plus the rest exactly fill the limit
- [ ] 3.4 Add a test that the ring never holds more than the pre-trigger size plus one chunk while waiting, counted from its chunk lengths

## 4. Measure

- [ ] 4.1 Re-run the benchmark and confirm the 90% pre-trigger case's slowest push is at most 10 ms and peak backlog bytes stay within the pre-trigger size plus one chunk; put the before and after numbers in the PR description (the 10 ms figure on the dev Mac is for the maintainer to confirm)
- [ ] 4.2 Run the app's demo-device capture with a trigger through a `scripts/ui.mjs` check to confirm the waveform and trigger position still display, and save a screenshot for the PR

## 5. Verify and archive

- [ ] 5.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 5.2 Run the `openspec-verify-change` skill against `77-trigger-backlog-no-copy` and resolve anything it flags
- [ ] 5.3 Run the `openspec-archive-change` skill to archive the change and update `openspec/specs/trigger/spec.md`
