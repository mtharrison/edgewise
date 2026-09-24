# Logical

A modern logic analyzer. Electron + React UI, Rust core.

```bash
npm install
npm run dev      # builds the Rust addon, then launches the app
npm test         # Rust unit tests
```

Needs Rust (rustup) and Node 20+.

## Layout

- `crates/logic-core`: sample storage with per-chunk summary trees, edge search, decoders (UART, I²C, SPI), software trigger, `.sr` load/save, VCD export, devices (demo generator, native fx2lafw USB driver via `nusb`)
- `crates/logic-node`: N-API binding, copied to `native/logic.node` by `scripts/build-native.mjs`
- `src/main`: Electron main process; owns the engine, exposes a whitelisted IPC surface
- `src/renderer`: React UI; canvas waveform fed by per-pixel (first, toggle-mask) data from Rust

## Hardware

FX2-based boards running sigrok's `fx2lafw` firmware. If the board has no firmware yet, Logical uploads it. It looks for the `.fw` files in the app's firmware folder (File → Open Firmware Folder), in installed PulseView bundles, and in the usual `sigrok-firmware` locations.
