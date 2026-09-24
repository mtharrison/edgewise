# Proposal

## Why

Delivers #10. Clicking a channel's trigger button cycles none → rising → falling → high → low, so "Any edge" can only be set from the trigger popover even though it is one of the five trigger conditions. This belongs to the Trigger epic (Epic #3).

## What Changes

- Clicking a channel's trigger button SHALL cycle through none, rising, falling, any edge, high and low, then back to none.
- When a channel has a condition, its trigger button SHALL show the condition's name ("Rising", "Falling", "Any edge", "High", "Low") next to the icon, and its tooltip SHALL use the same name. This was requested by a maintainer on this PR, because the icon alone doesn't say what it means.

### Non-goals

- Changing the trigger popover, the pre-trigger slider, the "Clear trigger" action or the trigger chip.
- Changing the icons on the channel trigger button, or how the button looks when no condition is set.
- Any change to how triggers are evaluated during capture (`crates/logic-core`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `trigger`: the "Trigger editing in the UI" requirement changes the channel-label cycle from "none, rising, falling, high and low" to "none, rising, falling, any edge, high and low", and requires the channel trigger button to name the active condition.

## Impact

- `src/renderer/src/actions.ts`: the trigger cycle order used by `cycleTrigger`.
- `src/renderer/src/actions.test.ts`: new unit test for the cycle.
- `src/renderer/src/components/Waveform.tsx` and `styles.css`: the channel trigger button's label and tooltip.
