# trigger Specification

## Purpose
Lets a capture wait for a specific signal condition before storing data, while keeping a configurable amount of signal from just before that moment.
## Requirements
### Requirement: Trigger conditions
Each channel SHALL accept at most one trigger condition: `rising` (low to high), `falling` (high to low), `edge` (either transition), `high` (level is high) or `low` (level is low). A capture with no conditions SHALL start storing immediately.

#### Scenario: No trigger
- **WHEN** a capture starts with no trigger conditions
- **THEN** samples are stored from the first data received and no trigger position is recorded

### Requirement: All conditions must match
When several channels have conditions, the trigger SHALL fire on the first sample where every condition holds at once, comparing that sample with the one before it.

#### Scenario: Edge plus level
- **WHEN** D0 is set to `rising` and D1 to `high`
- **THEN** the trigger fires only on a D0 rising edge that occurs while D1 is high

#### Scenario: Level-only trigger on first sample
- **WHEN** only level conditions are set and the very first sample already satisfies them
- **THEN** the trigger fires on that first sample

### Requirement: Pre-trigger retention
While waiting, the system SHALL keep the most recent samples in a buffer. With a sample limit, the buffer SHALL hold the pre-trigger fraction of the limit (clamped to between 0 and 0.99). With no limit, it SHALL hold 1,000,000 samples. When the trigger fires, the buffered samples SHALL become the start of the capture, and the trigger position SHALL be recorded as the index of the triggering sample.

#### Scenario: 10% pre-trigger
- **WHEN** a capture with a 100-sample limit and 0.1 pre-trigger triggers on a rising edge
- **THEN** the capture holds 100 samples, the trigger position is 10, sample 9 is before the edge, and sample 10 is after it

#### Scenario: Fewer samples than the buffer
- **WHEN** the trigger fires before the buffer has filled
- **THEN** all buffered samples are kept and the trigger position equals their count

### Requirement: Trigger as time origin
When a trigger position exists, times shown in the ruler, the timing panel and the decoded-data table SHALL be relative to it, so samples before the trigger have negative times.

#### Scenario: Negative pre-trigger time
- **WHEN** the cursor is on a sample before the trigger
- **THEN** its time is shown as negative

### Requirement: Trigger editing in the UI
The user SHALL be able to set each channel's condition from a trigger popover that lists all five conditions, and SHALL be able to cycle a channel's condition from its label through none, rising, falling, any edge, high and low, returning to none after low. When a channel has a condition, its trigger button SHALL show the condition's name ("Rising", "Falling", "Any edge", "High" or "Low") next to its icon. Each condition's icon SHALL differ from the icon shown when no condition is set. Hovering the trigger button SHALL show a tooltip that explains what the current condition means; when no condition is set, the tooltip SHALL list every condition with what it means. The popover SHALL offer a pre-trigger slider from 0% to 90% in 5% steps (default 10%) and a "Clear trigger" action. The trigger chip SHALL summarise the active conditions, joined by "&".

#### Scenario: Set from popover
- **WHEN** the user picks "Any edge" for D3 in the trigger popover
- **THEN** the chip shows D3's condition and the next capture waits for any D3 transition

#### Scenario: Cycle from channel label
- **WHEN** a channel has no trigger condition and the user clicks its trigger button six times
- **THEN** its condition becomes rising, falling, any edge, high, low and then none again, in that order

#### Scenario: Any edge reachable from channel label
- **WHEN** a channel's condition is falling and the user clicks its trigger button once
- **THEN** its condition becomes any edge and the trigger chip shows it

#### Scenario: Trigger button names the condition
- **WHEN** a channel's condition is any edge
- **THEN** its trigger button shows the text "Any edge" next to the icon

#### Scenario: Any edge icon differs from no trigger
- **WHEN** a channel's condition is any edge
- **THEN** its trigger button shows an up-down arrow icon, not the ⚡ shown when no condition is set

#### Scenario: Tooltip explains the condition
- **WHEN** a channel's condition is rising and the user hovers its trigger button
- **THEN** the tooltip says the trigger fires when the channel goes from low to high

#### Scenario: Tooltip explains every condition when none is set
- **WHEN** a channel has no trigger condition and the user hovers its trigger button
- **THEN** the tooltip lists Rising, Falling, Any edge, High and Low, each with what it means

