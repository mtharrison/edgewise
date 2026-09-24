# Tasks

## 1. Track disconnected selection in state

- [x] 1.1 Add a `deviceConnected` boolean to `State` (`src/renderer/src/store.ts`), defaulting to `true`, and verify `npm run typecheck` passes
- [x] 1.2 In `refreshDevices` (`src/renderer/src/actions.ts`), when the selected device is missing from the new list, keep it in `state.devices` (merged from the previous list) instead of falling back to `devices[0]`, and set `deviceConnected: false`; when it is present, set `deviceConnected: true`
- [x] 1.3 In `selectDevice`, always set `deviceConnected: true` for the newly picked device, and verify (via a unit test in step 2.1) that a disconnected device dropped this way is not reselected on the next `refreshDevices`

## 2. Match the same FX2 model on reappearance

- [x] 2.1 Add a small helper (e.g. `sameFx2Model(idA, idB)`) that compares the `vid:pid` prefix of two FX2 device ids, with a comment pointing at `crates/logic-core/src/devices/fx2lafw.rs` for the id format; add `src/renderer/src/actions.test.ts` covering: same vid:pid/different port matches, different vid:pid does not match, and non-`fx2:` ids (demo) never match
- [x] 2.2 In `refreshDevices`, when the previously selected device is disconnected, look for a newly listed device whose id matches via `sameFx2Model`; if found, select it (reusing `selectDevice`'s sample-rate/channel-reset logic) and set `deviceConnected: true`
- [x] 2.3 Add a unit test for `refreshDevices` (mocking `engine.listDevices`) covering: board disappears and stays selected as disconnected, same-model board reappears on a different port and is reselected, and a device with a different vid:pid does not trigger reselection

## 3. Reflect disconnection in the top bar

- [x] 3.1 In `TopBar.tsx`, render the selected device's option/label as disconnected (e.g. an appended "(disconnected)" or a status icon) when `deviceConnected` is `false`
- [x] 3.2 Disable the Start control and show an explanatory message (e.g. via the existing toast/notification path) when the user tries to start a capture while `deviceConnected` is `false`; guard this in `startCapture` (`actions.ts`) as well as the button's `disabled` state, since Start is also reachable via the Space shortcut
- [ ] 3.3 Manually verify in the running app (`npm run dev`, or a CDP-driven check per `EDGEWISE_CDP_PORT`): unplug the selected FX2 board, confirm the picker shows it disconnected and Start is blocked with a message, replug it and confirm it is reselected within ~3 s, then unplug again and pick another device to confirm that choice sticks

## 4. Verify and archive

- [ ] 4.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 4.2 Run the `openspec-verify-change` skill against `35-reselect-fx2-on-replug` and resolve anything it flags
- [ ] 4.3 Run the `openspec-archive-change` skill to archive the change and update `openspec/specs/app-shell/spec.md`
