# Tasks

## 1. Fetch the pinned firmware

- [x] 1.1 Add `scripts/fetch-firmware.mjs`: download the pinned `sigrok-firmware-fx2lafw-bin-<version>.tar.gz`, fail with a clear message if its SHA-256 differs from the pinned hash, and unpack the `.fw` files and `COPYING` into `firmware/`; verify that running it twice downloads only once, and that changing the pinned hash makes it exit non-zero
- [x] 1.2 Make the script also download the matching `sigrok-firmware-fx2lafw-<version>.tar.gz` source tarball, fail with a clear message if its SHA-256 differs from its own pinned hash, and copy it unchanged into `firmware/`; then write `firmware/README.txt` naming the release version, its GPL-2.0-or-later license and the bundled source tarball as the source (upstream URL as a secondary reference); verify after a run that the tarball unpacks and its version matches the binaries, and that changing the pinned source hash makes the script exit non-zero
- [x] 1.3 Add `firmware/` to `.gitignore` and verify `git status` stays clean after a run

## 2. Ship it in every installer

- [x] 2.1 Run the fetch script from `npm run package` before `electron-builder`, and add a `firmware` entry to `extraResources` in `electron-builder.yml` (with the header comment updated); verify `npm run package` on Linux produces `dist/linux-unpacked/resources/firmware/` with the `.fw` files, `COPYING`, `README.txt` and the source tarball (the filter must include `sigrok-firmware-fx2lafw-*.tar.gz`)
- [x] 2.2 Add `scripts/check-bundle.mjs`, which fails unless the unpacked app's `firmware/` folder under `dist/` holds every firmware file named in the FX2 profile table in `crates/logic-core/src/devices/fx2lafw.rs`, plus `COPYING`, `README.txt` and the source tarball; verify it passes on the Linux package from 2.1, and fails after deleting one `.fw` file from it and, separately, after deleting the source tarball
- [x] 2.3 Run `node scripts/check-bundle.mjs` after packaging in both packaging steps of `.github/workflows/release.yml` (it runs at the end of `npm run package`, which both steps call); verify (maintainer) with a manual `workflow_dispatch` run that all four jobs pass

## 3. Precedence and docs

- [ ] 3.1 Add a unit test in `crates/logic-core/src/devices/fx2lafw.rs` where two firmware folders both hold the file and `find_firmware` returns the first folder's copy; verify `npm test` passes
- [ ] 3.2 Update the Hardware section of `README.md` to say the app ships sigrok's fx2lafw firmware (GPL-2.0-or-later, license and source tarball in the bundled firmware folder) and that files in the app's firmware folder take precedence; verify the wording matches the specs
- [ ] 3.3 On a real board with an installer from 2.3 (maintainer): on a machine with no sigrok firmware and an empty user firmware folder, plug in a bare Saleae clone and confirm it lists "Firmware will be uploaded on first capture" and the first capture succeeds with no dialog; then put a different copy of the file in the user firmware folder and confirm that copy is uploaded

## 4. Verify and archive

- [ ] 4.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 4.2 Run the `openspec-verify-change` skill against `71-bundle-fx2lafw` and resolve anything it flags
- [ ] 4.3 Run the `openspec-archive-change` skill to archive the change and update `openspec/specs/devices/spec.md`
