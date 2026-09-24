# Design

## Context

See proposal.md - Why. `refreshDevices` (`src/renderer/src/actions.ts`) is the only place a device gets deselected today: `keep = devices.find((d) => d.id === deviceId)`, and if nothing matches it falls back to `devices[0]`. FX2 device ids come from the Rust core as `fx2:{vid:04x}:{pid:04x}:{port_key}` (`crates/logic-core/src/devices/fx2lafw.rs`); `port_key` is derived from the USB bus/port path, so the same physical board gets a different id on a different port. The demo device's id is a fixed constant. `DeviceInfo` carries no separate vendor/product fields today - only the composite `id` and `driver` (always `"fx2lafw"` for every FX2 profile, so it can't disambiguate models).

## Goals / Non-Goals

**Goals:**
- Decide how the renderer recognizes "same model, different port" without changing the Rust core or the engine's IPC surface (see proposal.md - Non-goals).
- Decide how "selected but disconnected" is represented in renderer state so the picker, the pickers next to it, and Start can all read it.

**Non-Goals:**
- Changing `DeviceInfo` or the engine bridge's `listDevices` payload.
- Persisting the disconnected selection across an app restart.

## Decisions

- **Match reappearance by parsing the `vid:pid` prefix out of the existing device id string**, rather than adding vendor/product-id fields to `DeviceInfo`. The id format is already stable (`fx2:{vid}:{pid}:{port}`), and the alternative (extending the Rust struct and the N-API binding) is a backend change the proposal explicitly excludes for what is a renderer-only bug. Trade-off: the renderer now depends on an id format it doesn't own; a comment at the parsing site should point back to `devices/fx2lafw.rs` so the two stay in sync. Worth revisiting as a follow-up if another feature needs vendor/product id for its own reasons.
- **Keep the disconnected device in `state.devices`** (merged back in by `refreshDevices` when it drops out of the live list) rather than adding a separate `disconnectedDevice` field, and add a derived `deviceConnected: boolean` to `State`. This keeps `TopBar`'s existing `devices.find((d) => d.id === deviceId)` lookup working unchanged for rendering the picker row, sample rate and note; only the connected flag and Start's guard need new reads.
- **Clear the "remembered" device the moment the user picks a different one**, by dropping it from `state.devices` immediately on `selectDevice` rather than waiting for the next scan. This makes "manual pick wins" (proposal.md) unconditional instead of racing the 3 s poll.

## Risks / Trade-offs

- Parsing the id string is brittle if the id format changes → the id format is already a cross-boundary contract (it round-trips through `open()` in `devices/mod.rs`), so this adds no new coupling that didn't already exist; flagged above for a code comment.
- A board that re-enumerates as a *different* profile than what was selected (shouldn't happen for a real board, but a dev could swap hardware while a placeholder is disconnected) would not match and would stay disconnected - acceptable per proposal.md - Non-goals.
