# Design

## Context

See proposal.md (Why). The channel trigger button in the waveform's channel label (`Waveform.tsx`) calls `cycleTrigger`, which steps through a fixed `TRIGGER_CYCLE` list in `src/renderer/src/actions.ts`: `[null, 'rising', 'falling', 'high', 'low']`. The popover uses `setTrigger` and is unaffected. The button already has an icon for `edge`, so it renders correctly once the cycle can reach it.

## Goals / Non-Goals

**Goals:**
- Make the cycle order match the spec: none, rising, falling, any edge, high, low.

**Non-Goals:**
- Refactoring how the cycle is computed.

## Decisions

- **Insert `'edge'` between `'falling'` and `'high'` in `TRIGGER_CYCLE`.** This is the order the issue asks for and groups the three edge conditions before the two level conditions. The alternative, appending `'edge'` after `'low'`, would leave it last and separate from the other edge conditions.
- **Test via `cycleTrigger` against the store**, as `actions.test.ts` already does for device actions, rather than exporting `TRIGGER_CYCLE`. This tests the behavior the user sees, not the constant.

## Risks / Trade-offs

- [Users used to the old order get one extra click from falling to high] → Acceptable; the new order is what the issue requests.

## Follow-up issue candidates

- A maintainer comment on #10 notes that it isn't clear what the per-channel trigger icons mean, or what happens if none is chosen. That is out of scope here (no `Spec:` requirements given) and could become its own issue.
- The channel trigger button's tooltip shows the raw condition name (e.g. "Trigger: edge") rather than the popover's label ("Any edge").
