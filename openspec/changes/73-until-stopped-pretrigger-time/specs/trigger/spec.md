# Spec Delta

## MODIFIED Requirements

### Requirement: Pre-trigger retention
While waiting, the system SHALL keep the most recent samples in a buffer. With a sample limit, the buffer SHALL hold the pre-trigger fraction of the limit (clamped to between 0 and 0.99). With no limit, the buffer SHALL hold the pre-trigger time's worth of samples at the capture's sample rate (clamped to between 0 and 1 s), up to a fixed memory cap. When the pre-trigger time would need more memory than the cap at the capture's sample rate and channel count, the buffer SHALL hold as many samples as the cap allows, and when the trigger fires the app SHALL tell the user how much time before the trigger was kept. When the trigger fires, the buffered samples SHALL become the start of the capture, and the trigger position SHALL be recorded as the index of the triggering sample.

#### Scenario: 10% pre-trigger
- **WHEN** a capture with a 100-sample limit and 0.1 pre-trigger triggers on a rising edge
- **THEN** the capture holds 100 samples, the trigger position is 10, sample 9 is before the edge, and sample 10 is after it

#### Scenario: Fewer samples than the buffer
- **WHEN** the trigger fires before the buffer has filled
- **THEN** all buffered samples are kept and the trigger position equals their count

#### Scenario: Pre-trigger time until stopped
- **WHEN** a capture with no sample limit and a 100 ms pre-trigger time triggers after more than 100 ms of signal
- **THEN** the trigger position is the number of samples in 100 ms at the capture's sample rate, at 1 MHz and at 24 MHz alike, and no "kept" message is shown

#### Scenario: Pre-trigger time over the memory cap
- **WHEN** a capture with no sample limit has a pre-trigger time that needs more memory than the cap at its sample rate, and triggers after more than that time of signal
- **THEN** the capture keeps as many samples before the trigger as the cap allows, and the app shows a message saying how much time before the trigger it kept

### Requirement: Trigger editing in the UI
The user SHALL be able to set each channel's condition from a trigger popover that lists all five conditions, and SHALL be able to cycle a channel's condition from its label through none, rising, falling, any edge, high and low, returning to none after low. When a channel has a condition, its trigger button SHALL show the condition's name ("Rising", "Falling", "Any edge", "High" or "Low") next to its icon. Each condition's icon SHALL differ from the icon shown when no condition is set. Hovering the trigger button SHALL show a tooltip that explains what the current condition means; when no condition is set, the tooltip SHALL list every condition with what it means. The popover SHALL offer a pre-trigger slider and a "Clear trigger" action. With a timed duration, the slider SHALL set a percentage from 0% to 90% in 5% steps (default 10%) and SHALL be labelled as a percentage. With the duration set to "Until stopped", the slider SHALL set a time from 0 to 1 s in 10 ms steps (default 100 ms) and SHALL be labelled as a time. The percentage and the time SHALL be separate settings: changing one SHALL NOT change the other, and switching between a timed duration and "Until stopped" SHALL show each mode's own value. The trigger chip SHALL summarise the active conditions, joined by "&".

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

#### Scenario: Pre-trigger in time until stopped
- **WHEN** the duration is "Until stopped" and the user opens the trigger popover with default settings
- **THEN** the Pre-trigger slider is labelled "100 ms" and ranges from 0 to 1 s

#### Scenario: Pre-trigger as a percentage for timed captures
- **WHEN** the duration is 100 ms and the user opens the trigger popover with default settings
- **THEN** the Pre-trigger slider is labelled "10%" and ranges from 0% to 90%

#### Scenario: Each mode keeps its own pre-trigger
- **WHEN** the user sets 30% pre-trigger with a 1 s duration, switches to "Until stopped" and sets 500 ms, then switches back to 1 s
- **THEN** the slider shows 30%, and switching to "Until stopped" again shows 500 ms
