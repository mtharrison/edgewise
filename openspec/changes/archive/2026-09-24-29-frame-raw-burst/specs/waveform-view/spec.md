## ADDED Requirements

### Requirement: Zoom to a burst
While Cmd (macOS) or Ctrl (Windows and Linux) is held, the burst under the pointer on a channel row SHALL be highlighted, including when the key is pressed or released without moving the pointer. A burst SHALL be a run of transitions on that channel in which every gap between consecutive transitions is shorter than an idle threshold of a few pixels at the current zoom. The pointer is on a burst when it lies between its first and last transition, or within a couple of pixels of them. Cmd/Ctrl+click on a burst SHALL zoom and pan the view so that the burst is centred and fills the plot width except for the same margin used for annotations, within the normal zoom limits, and SHALL turn follow mode off. Cmd/Ctrl+click on a channel row where there is no burst SHALL change nothing. A modified click on a channel row SHALL NOT start a pan. Decoder rows SHALL keep the behaviour of "Zoom to an annotation".

#### Scenario: Frame a burst
- **WHEN** a channel with no decoder shows a burst of data between long idle stretches, and the user holds Cmd over the burst and clicks
- **THEN** the burst is centred and spans nearly the whole plot width, and follow mode is off

#### Scenario: Highlight follows the modifier key
- **WHEN** the pointer rests on a burst and the user presses Cmd without moving
- **THEN** the whole burst is highlighted, and the highlight clears when Cmd is released

#### Scenario: Pointer in a short gap inside a burst
- **WHEN** the pointer is over a gap between two transitions of a burst, and the gap is shorter than the idle threshold
- **THEN** the whole burst is highlighted, as if the pointer were on a transition

#### Scenario: Idle stretch
- **WHEN** the user Cmd+clicks a channel row on a stretch with no transitions within the idle threshold
- **THEN** the view does not change and no pan starts

#### Scenario: Single isolated transition
- **WHEN** the user Cmd+clicks next to a transition whose neighbours on both sides are further away than the idle threshold
- **THEN** the view does not change

#### Scenario: Refine after framing
- **WHEN** the user has framed a burst and its bytes are now separated by gaps wider than the idle threshold, and the user Cmd+clicks one byte
- **THEN** the view frames that byte

#### Scenario: Very short burst
- **WHEN** the user Cmd+clicks a burst only a few samples long
- **THEN** the view zooms in as far as the zoom limit allows and centres it

#### Scenario: Decoder rows unchanged
- **WHEN** the user Cmd+clicks an annotation on a decoder row
- **THEN** the annotation is framed as before
