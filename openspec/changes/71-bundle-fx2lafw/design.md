# Design

## Context

`src/main/index.ts` already passes `process.resourcesPath/firmware` to the engine as the second firmware folder, after the user firmware folder, and `find_firmware` in `crates/logic-core/src/devices/fx2lafw.rs` takes the first folder that holds the file. So once the folder is filled, precedence and upload need no code change. `electron-builder.yml` copies only `native/` into resources. `release.yml` runs `npm run package` on macOS (arm64 and Intel), Linux and Windows runners; CI (`ci.yml`) does not package.

## Goals / Non-Goals

**Goals:**
- Reproducible firmware in every installer: the same pinned release, checked by hash, on every runner.
- License compliance for aggregation: GPL text and the matching source tarball next to the binaries.

**Non-Goals:**
- Changing how firmware is found or uploaded at runtime.
- Keeping the `.fw` binaries in git.

## Decisions

### Download at package time, pinned by version and SHA-256

`scripts/fetch-firmware.mjs` downloads `sigrok-firmware-fx2lafw-bin-<version>.tar.gz` from sigrok.org's binary downloads, checks its SHA-256 against a constant in the script, and unpacks the `.fw` files and `COPYING` into `firmware/` (gitignored). It also downloads the matching source tarball, `sigrok-firmware-fx2lafw-<version>.tar.gz`, from sigrok.org's source downloads, checks it against its own pinned SHA-256, and copies it into `firmware/` unchanged. Both tarballs come from the one pinned version constant. It skips the downloads when `firmware/` already holds the pinned version, which a small stamp file records. `npm run package` runs it before `electron-builder`. The pin is the latest fx2lafw release at implementation time (0.1.7 today); the implementer records both hashes from the published files.

Alternative: commit the `.fw` files to the repo. Simpler and offline, but puts GPL binaries in the MIT source tree with no record of where they came from, and an update is an opaque binary diff. A pinned version plus hash in one script is easier to review and bump.

Alternative: build fx2lafw from source with sdcc. Needs an 8051 toolchain on all four runners for no gain over the signed-off release binaries.

### License and source tarball beside the firmware

The script writes `firmware/COPYING` (from the binary tarball) and `firmware/README.txt` naming the release version, its GPL-2.0-or-later license, and the bundled `sigrok-firmware-fx2lafw-<version>.tar.gz` as the source of the `.fw` files. The README gives the upstream URL of the same tarball as a secondary reference only. The license, README and source tarball all ship inside the bundled firmware folder, so the source travels with every copy of the binaries and needs no network access.

Alternative: ship only a link to the source tarball on sigrok.org. Smaller installers, but a link alone doesn't clearly satisfy GPLv2 §3. Taking the GPLv3 option (fx2lafw is "or later") would allow a link under §6(d), but compliance would then depend on sigrok's download page staying where it is. Rejected.

Alternative: a Help-menu "Licenses" window. Useful later, but not needed for compliance, and it touches the app-shell menus spec. Left as a follow-up.

### Ship with `extraResources`, check the packaged output

`electron-builder.yml` gets `- from: firmware, to: firmware, filter: ['*.fw', 'COPYING', 'README.txt', 'sigrok-firmware-fx2lafw-*.tar.gz']`. A packaging check (`scripts/check-bundle.mjs`) runs after `npm run package` in `release.yml`. It finds the unpacked app under `dist/` (`mac*/Edgewise.app/Contents/Resources`, `linux-unpacked/resources`, `win-unpacked/resources`) and fails unless its `firmware/` folder holds every firmware file named in the FX2 profile table, plus `COPYING`, `README.txt` and the source tarball. The check keeps its own list of those files, with a comment pointing at the table in `fx2lafw.rs`.

On macOS, `after-pack.mjs` re-signs the whole bundle after resources are added, and the notarized path signs it too, so the new files don't break signatures.

### Precedence covered by a unit test

Precedence already holds in code. A Rust unit test on `find_firmware` with two temp folders that both hold the file confirms the first folder wins, so a future refactor can't silently reverse it.

## Risks / Trade-offs

- [sigrok.org down or slow during a release] → The build fails loudly rather than shipping without firmware; the stamp file lets a re-run reuse a completed download.
- [A pinned release lacks a file for a supported board] → The packaging check fails the release and names the missing file.
- [The bundled source drifts from the binaries] → Both tarballs are derived from one version constant and each has its own pinned hash, so a bump that updates only one fails the fetch.
- [The source tarball makes every installer larger] → Accepted; it is small next to the Electron runtime, and it keeps compliance offline.
- [Bundled firmware makes the Choose firmware folder dialog rare] → Intended; the dialog stays as the fallback for dev builds and removed files.
- [`npm run dev` still has no bundled firmware, since `process.resourcesPath` there is Electron's own] → Accepted (Non-goal); developers with a board can put firmware in the user folder.

### Follow-up issue candidates

- Windows: a bare board needs the WinUSB driver before the app can talk to it, so first run on Windows can still fail. Worth an issue on driver guidance or installation.
- A Help-menu entry that shows third-party licenses (fx2lafw, and the npm and crate dependencies).
