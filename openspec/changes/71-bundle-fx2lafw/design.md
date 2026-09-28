# Design

## Context

`src/main/index.ts` already passes `process.resourcesPath/firmware` to the engine as the second firmware folder, after the user firmware folder, and `find_firmware` in `crates/logic-core/src/devices/fx2lafw.rs` takes the first folder that holds the file. So once the folder is filled, precedence and upload need no code change. `electron-builder.yml` copies only `native/` into resources. `release.yml` runs `npm run package` on macOS (arm64 and Intel), Linux and Windows runners; CI (`ci.yml`) does not package.

## Goals / Non-Goals

**Goals:**
- Reproducible firmware in every installer: the same pinned release, checked by hash, on every runner.
- License compliance for aggregation: GPL text and a source link next to the binaries.

**Non-Goals:**
- Changing how firmware is found or uploaded at runtime.
- Keeping the `.fw` binaries in git.

## Decisions

### Download at package time, pinned by version and SHA-256

`scripts/fetch-firmware.mjs` downloads `sigrok-firmware-fx2lafw-bin-<version>.tar.gz` from sigrok.org's binary downloads, checks its SHA-256 against a constant in the script, and unpacks the `.fw` files and `COPYING` into `firmware/` (gitignored). It skips the download when `firmware/` already holds the pinned version, which a small stamp file records. `npm run package` runs it before `electron-builder`. The pin is the latest fx2lafw release at implementation time (0.1.7 today); the implementer records its hash from the published file.

Alternative: commit the `.fw` files to the repo. Simpler and offline, but puts GPL binaries in the MIT source tree with no record of where they came from, and an update is an opaque binary diff. A pinned version plus hash in one script is easier to review and bump.

Alternative: build fx2lafw from source with sdcc. Needs an 8051 toolchain on all four runners for no gain over the signed-off release binaries.

### License and source note beside the firmware

The script writes `firmware/COPYING` (from the tarball) and `firmware/README.txt` naming the release version, its GPL-2.0-or-later license, and the URL of the matching source tarball (`sigrok-firmware-fx2lafw-<version>.tar.gz` under sigrok.org's source downloads). Both ship inside the bundled firmware folder, so they travel with every copy of the binaries.

Alternative: a Help-menu "Licenses" window. Useful later, but not needed for compliance, and it touches the app-shell menus spec. Left as a follow-up.

### Ship with `extraResources`, check the packaged output

`electron-builder.yml` gets `- from: firmware, to: firmware, filter: ['*.fw', 'COPYING', 'README.txt']`. A packaging check (`scripts/check-bundle.mjs`) runs after `npm run package` in `release.yml`. It finds the unpacked app under `dist/` (`mac*/Edgewise.app/Contents/Resources`, `linux-unpacked/resources`, `win-unpacked/resources`) and fails unless its `firmware/` folder holds every firmware file named in the FX2 profile table, plus `COPYING` and `README.txt`. The check keeps its own list of those files, with a comment pointing at the table in `fx2lafw.rs`.

On macOS, `after-pack.mjs` re-signs the whole bundle after resources are added, and the notarized path signs it too, so the new files don't break signatures.

### Precedence covered by a unit test

Precedence already holds in code. A Rust unit test on `find_firmware` with two temp folders that both hold the file confirms the first folder wins, so a future refactor can't silently reverse it.

## Risks / Trade-offs

- [sigrok.org down or slow during a release] → The build fails loudly rather than shipping without firmware; the stamp file lets a re-run reuse a completed download.
- [A pinned release lacks a file for a supported board] → The packaging check fails the release and names the missing file.
- [Bundled firmware makes the Choose firmware folder dialog rare] → Intended; the dialog stays as the fallback for dev builds and removed files.
- [`npm run dev` still has no bundled firmware, since `process.resourcesPath` there is Electron's own] → Accepted (Non-goal); developers with a board can put firmware in the user folder.

### Follow-up issue candidates

- Windows: a bare board needs the WinUSB driver before the app can talk to it, so first run on Windows can still fail. Worth an issue on driver guidance or installation.
- A Help-menu entry that shows third-party licenses (fx2lafw, and the npm and crate dependencies).
