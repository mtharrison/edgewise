## 1. Burst search in the core

- [x] 1.1 Add `Snapshot::burst_at(mask, sample, max_gap, tolerance, budget)` in `capture.rs`, using `next_change` / `prev_change` window jumps as in design.md
- [x] 1.2 Rust tests: pointer on a transition, pointer in a short gap inside a burst, pointer on an idle stretch, pointer within tolerance just outside a burst, lone transition, burst at the capture's start and end, bursts crossing a chunk boundary, a dense stretch longer than the budget, other channels' transitions ignored
- [x] 1.3 Expose `burst_at` in `logic-node`, add `burstAt` to the main process method list and `api.ts`

## 2. Interaction

- [ ] 2.1 Rename `frameAnnotation` to `frameSpan` in `actions.ts` and its caller
- [ ] 2.2 In `Waveform.tsx`, while the modifier is held over a channel row, request `burstAt` (one in flight, latest wins) with an 8 px idle threshold and 2 px tolerance; keep the result as a burst highlight; clear it on key release, blur, view change or leaving the row
- [ ] 2.3 On modified pointer-down over a channel row: query `burstAt` at the click and frame it if found; never start a pan
- [ ] 2.4 Draw the burst highlight in `draw.ts` (channel-coloured band and outline) and show a pointer cursor over it

## 3. Verify and archive

- [ ] 3.1 `npm test` and `npm run typecheck` pass
- [ ] 3.2 By hand with the demo device, on a channel with no decoder: every scenario in the spec delta, and #21's decoder scenarios still hold
- [ ] 3.3 Run `/opsx:verify`, then archive the change in this PR
