# Design

## Context

See proposal.md (Why). The channel trigger button in the waveform's channel label (`Waveform.tsx`) calls `cycleTrigger`, which steps through a fixed `TRIGGER_CYCLE` list in `src/renderer/src/actions.ts`: `[null, 'rising', 'falling', 'high', 'low']`. The popover uses `setTrigger` and is unaffected. The button already has an icon for `edge`, so it renders correctly once the cycle can reach it.

## Goals / Non-Goals

**Goals:**
- Make the cycle order match the spec: none, rising, falling, any edge, high, low.
- Make the channel trigger button say which condition is set, not just show an icon.

**Non-Goals:**
- Refactoring how the cycle is computed.

## Decisions

- **Insert `'edge'` between `'falling'` and `'high'` in `TRIGGER_CYCLE`.** This is the order the issue asks for and groups the three edge conditions before the two level conditions. The alternative, appending `'edge'` after `'low'`, would leave it last and separate from the other edge conditions.
- **Test via `cycleTrigger` against the store**, as `actions.test.ts` already does for device actions, rather than exporting `TRIGGER_CYCLE`. This tests the behavior the user sees, not the constant.
- **Show the condition's name next to its icon on the channel trigger button, only when a condition is set.** The button widens to fit the text. With no condition it stays a bare ⚡ that only appears on hover, as today, so channels without triggers don't get cluttered. The alternative, a tooltip only, still hides the meaning until you hover.
- **Give "Any edge" the `ArrowUpDown` icon instead of `Zap`.** ⚡ also means "trigger" in general: it is the unset button and the top-bar trigger chip. Using it for "Any edge" as well made it unclear whether a channel had a trigger set. `ArrowUpDown` matches the popover's "↕ Any edge" and fits with the other edge icons (↗ and ↘). ⚡ now only means "trigger".
- **Use the popover's words without its arrow glyphs** ("Rising", "Falling", "Any edge", "High", "Low"). The button already has an icon, so the glyph would repeat it. The tooltip uses the same names, so it no longer shows the raw value ("Trigger: edge").
- **Explain each condition in a tooltip the app draws itself**, from a `TRIGGER_HINT` table next to `TRIGGER_NAME`. With a condition set, the tooltip names it, says what it means and notes that all channel conditions must hold at once. With none set, it lists every condition with its meaning (in cycle order) and says the capture starts straight away if no channel has a trigger. The tooltip appears on hover, straight away, to the right of the gutter and uses `position: fixed` so the gutter's `overflow: hidden` doesn't cut it off. A native `title` tooltip was tried first, but a maintainer found it didn't show in the app. It also only appears after a delay and can't be styled.

## Risks / Trade-offs

- [Users used to the old order get one extra click from falling to high] → Acceptable; the new order is what the issue requests.
- [The wider button leaves less room for the channel name in the 200px gutter] → Long names are cut off with an ellipsis, as they already are. Only channels with a trigger are affected.

## Follow-up issue candidates

- A maintainer comment on #10 also asks what happens if no trigger is chosen (the capture starts immediately). Nothing in the UI says so. That could become its own issue.
