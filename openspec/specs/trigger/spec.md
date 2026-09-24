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
The user SHALL be able to set each channel's condition from a trigger popover that lists all five conditions, and SHALL be able to cycle a channel's condition from its label through none, rising, falling, high and low. The popover SHALL offer a pre-trigger slider from 0% to 90% in 5% steps (default 10%) and a "Clear trigger" action. The trigger chip SHALL summarise the active conditions, joined by "&".

#### Scenario: Set from popover
- **WHEN** the user picks "Any edge" for D3 in the trigger popover
- **THEN** the chip shows D3's condition and the next capture waits for any D3 transition

