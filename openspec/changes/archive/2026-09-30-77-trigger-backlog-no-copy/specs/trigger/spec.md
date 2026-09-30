## ADDED Requirements

### Requirement: Trigger hand-over keeps up with the device
When the trigger fires, moving the pre-trigger samples into the capture SHALL NOT hold up handling of the device's data for longer than a fixed bound, however large the pre-trigger buffer is. On the development Mac, handling a single block of device data SHALL take no more than 10 ms at the moment the trigger fires. Memory used by the pre-trigger samples SHALL stay within the pre-trigger buffer's own size plus a small fixed margin, both while waiting and when the trigger fires; the samples SHALL NOT be copied a second time.

#### Scenario: Large pre-trigger at 24 MHz
- **WHEN** a 10 s capture at 24 MHz with 8 channels and 90% pre-trigger triggers 5 s after it starts
- **THEN** no single block of device data takes more than 10 ms to handle on the development Mac, and the capture's samples and trigger position are the same as before this change

#### Scenario: No second copy at the trigger point
- **WHEN** a capture with a 216 MB pre-trigger buffer triggers after the buffer has filled
- **THEN** peak memory used by the pre-trigger samples stays within 216 MB plus the fixed margin

#### Scenario: Saved file after a large pre-trigger
- **WHEN** a capture that kept pre-trigger samples is saved and reopened
- **THEN** the reopened capture starts at the first kept pre-trigger sample and has the same samples
