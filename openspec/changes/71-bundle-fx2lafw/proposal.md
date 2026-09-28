# Proposal

## Why

Delivers #71. A new user who plugs in a bare Saleae clone sees "Needs fx2lafw-saleae-logic.fw in a firmware folder", then has to download sigrok's firmware and choose its folder before the first capture works. The firmware search already looks in the app's bundled firmware folder, but packaging never fills it: `electron-builder.yml` ships only `native/`.

fx2lafw is GPL-2.0-or-later, but it runs on the board as a separate program, so shipping it next to Edgewise's MIT code is aggregation. The GPL allows that as long as its license text and a way to get the source come with it.

## What Changes

- Packaging downloads a pinned sigrok-firmware-fx2lafw binary release, checks it against a recorded checksum, and ships its `.fw` files in the bundled firmware folder of every installer (macOS, Linux, Windows).
- The bundled firmware folder also holds fx2lafw's license text and a note naming the release, with a link to its matching source release.
- On a fresh install, a bare FX2 board is listed as "Firmware will be uploaded on first capture", and the first capture uploads the firmware with no user steps.
- Firmware in the user firmware folder keeps taking precedence over the bundled copy.
- A packaging check fails the release build if an installer's bundled firmware folder lacks the firmware files or the license.
- The README says the firmware now ships with the app.

### Non-goals

- Building fx2lafw from source; the pinned release's prebuilt `.fw` files are shipped as-is.
- Bundling `sigrok-cli`, libsigrok or firmware for any board other than fx2lafw.
- Installing USB drivers on Windows (for example WinUSB through Zadig).
- An in-app screen or menu item showing third-party licenses.
- Changing the Choose firmware folder dialog; it still appears if the file is missing from every folder.
- Filling the bundled firmware folder in `npm run dev`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `devices`: adds a requirement that installers ship fx2lafw firmware, with its license and source link, in the bundled firmware folder, and adds scenarios to Firmware folders for a fresh install and for user firmware taking precedence.

## Impact

- `electron-builder.yml`: a second `extraResources` entry for `firmware/`.
- New `scripts/fetch-firmware.mjs` (download, verify checksum, unpack into `firmware/`), run by `npm run package` before `electron-builder`; `firmware/` is gitignored.
- New packaging check script, run by `.github/workflows/release.yml` after packaging.
- `crates/logic-core/src/devices/fx2lafw.rs`: a unit test for folder precedence.
- `README.md`: the Hardware section.
- Packaging needs network access to sigrok.org (or a cached download).
