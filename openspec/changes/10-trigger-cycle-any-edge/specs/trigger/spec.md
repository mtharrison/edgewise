# Spec Delta

## MODIFIED Requirements

### Requirement: Trigger editing in the UI
The user SHALL be able to set each channel's condition from a trigger popover that lists all five conditions, and SHALL be able to cycle a channel's condition from its label through none, rising, falling, any edge, high and low, returning to none after low. The popover SHALL offer a pre-trigger slider from 0% to 90% in 5% steps (default 10%) and a "Clear trigger" action. The trigger chip SHALL summarise the active conditions, joined by "&".

#### Scenario: Set from popover
- **WHEN** the user picks "Any edge" for D3 in the trigger popover
- **THEN** the chip shows D3's condition and the next capture waits for any D3 transition

#### Scenario: Cycle from channel label
- **WHEN** a channel has no trigger condition and the user clicks its trigger button six times
- **THEN** its condition becomes rising, falling, any edge, high, low and then none again, in that order

#### Scenario: Any edge reachable from channel label
- **WHEN** a channel's condition is falling and the user clicks its trigger button once
- **THEN** its condition becomes any edge and the trigger chip shows it
