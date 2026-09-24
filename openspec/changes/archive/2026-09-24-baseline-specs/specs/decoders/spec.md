## Purpose

Turns captured signals into readable protocol data (UART, I²C, SPI) shown as labelled annotations on the waveform and in a table.

## ADDED Requirements

### Requirement: Decoder instances
The user SHALL be able to add any number of UART, I²C or SPI decoders, change their settings, hide or show their rows, and remove them. Each decoder SHALL produce annotations in named rows: UART "Data" and "Errors", I²C "Data" and "Events", SPI "MOSI" and "MISO". Each annotation SHALL have a start sample, end sample, row, class and text.

#### Scenario: Add a decoder
- **WHEN** the user adds an I²C decoder
- **THEN** it appears in the Analyzers panel with default settings, its two rows appear on the waveform, and it decodes the current capture

### Requirement: Annotation classes
Each annotation SHALL have one class: data, address, control, ack, warning or error. The UI SHALL colour annotations by class.

#### Scenario: NACK shown as warning
- **WHEN** an I²C byte is not acknowledged
- **THEN** its "NACK" annotation has the warning class

### Requirement: Value formats
Decoded values SHALL be shown in the decoder's chosen format: hex (`0x` and zero-padded to the word width), decimal, binary (zero-padded to the word width), or ASCII. ASCII SHALL show printable characters in single quotes, newline, carriage return and tab as `\n`, `\r` and `\t`, and anything else as two-digit hex.

#### Scenario: ASCII control character
- **WHEN** a UART byte 0x0D is shown in ASCII format
- **THEN** its text is `\r`

### Requirement: UART decoding
The UART decoder SHALL decode one channel with configurable baud rate, 5–9 data bits, parity (none, even, odd), stop bits (1, 1.5, 2), bit order (LSB first by default) and inversion. It SHALL sample each bit at its centre, ignore a start edge whose line is no longer active half a bit later, and ignore a frame that would run past the end of the capture. A frame with a parity or stop-bit error SHALL be shown with the warning class on the Data row, plus an error-class "Parity error" or "Framing error" annotation on the Errors row. Decoding SHALL produce nothing if the sample rate is less than twice the baud rate.

#### Scenario: Decode text
- **WHEN** "Hi" is sent at 100 kbaud, 8N1, captured at 1 MHz, and decoded in ASCII format
- **THEN** the Data row reads `'H'`, `'i'`

#### Scenario: Missing stop bit
- **WHEN** a frame's stop bit is low
- **THEN** the byte is shown as a warning and the Errors row shows "Framing error"

### Requirement: I²C decoding
The I²C decoder SHALL decode configurable SCL and SDA channels. It SHALL mark start (`S`), repeated start (`Sr`) and stop (`P`) conditions on the Events row with the control class, sample SDA on SCL rising edges, and show each ACK or NACK on the Events row. The first byte after a start SHALL be shown as an address with "Read" or "Write" and the 7-bit address; later bytes SHALL be shown as data.

#### Scenario: Write transaction
- **WHEN** a write of 0x42 to address 0x50 is captured
- **THEN** the annotations read `S`, `Write 0x50`, `ACK`, `0x42`, `ACK`, `P`

### Requirement: SPI decoding
The SPI decoder SHALL decode a clock channel, optional MOSI, MISO and chip-select channels, chip-select polarity, CPOL and CPHA (modes 0–3), 1–32 bits per word, and bit order. It SHALL sample on the edge given by the mode, only while chip select is active (always, if no chip select is set), and SHALL restart word assembly on every chip-select change. Each completed word SHALL be shown on the MOSI row and the MISO row for whichever lines are set.

#### Scenario: Mode 0 byte
- **WHEN** a mode 0 transfer sends 0xA5 on MOSI and receives 0x3C on MISO with chip select active low
- **THEN** the MOSI row shows `0xA5` and the MISO row shows `0x3C`

### Requirement: Background decoding
Decoding SHALL run in the background without blocking the UI. Starting a new decode of the same decoder SHALL cancel the previous one, and removing a decoder SHALL cancel its decode. The UI SHALL re-run all decoders when the capture is replaced, when a capture finishes or fails, when a decoder's settings change, and about once per second during a running capture. While any decoder is busy, the status bar SHALL show "Decoding".

#### Scenario: Live decode
- **WHEN** a capture is running with a UART decoder added
- **THEN** new UART frames appear roughly every second without stopping the capture

#### Scenario: Settings change
- **WHEN** the user changes a decoder's baud rate
- **THEN** that decoder re-runs on the current capture and its annotations update

### Requirement: Annotation queries
The system SHALL return a row's annotations that overlap a sample range, capped at a limit. Annotations narrower than a given minimum width SHALL be merged with close neighbours into textless "dense" blocks. The system SHALL also return a row's annotations by page (offset and count, with the total), and the index of the first annotation ending at or after a sample.

#### Scenario: Zoomed out on busy traffic
- **WHEN** the view is zoomed out so that many annotations are narrower than 3 screen pixels
- **THEN** they are drawn as merged dense blocks instead of individual boxes
