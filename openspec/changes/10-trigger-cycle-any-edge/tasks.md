# Tasks

## 1. Add "Any edge" to the trigger cycle

- [x] 1.1 In `src/renderer/src/actions.ts`, change `TRIGGER_CYCLE` to `[null, 'rising', 'falling', 'edge', 'high', 'low']`, and verify `npm run typecheck` passes
- [x] 1.2 Add a `cycleTrigger` test to `src/renderer/src/actions.test.ts` covering both spec scenarios: starting from none, six clicks give rising, falling, edge, high, low, none; and one click from falling gives edge, without changing other channels' conditions. Verify `npx vitest run` passes
- [x] 1.3 Verify in the running app (`node scripts/ui.mjs scripts/checks/trigger-cycle.mjs`): click a channel's trigger button repeatedly and confirm the icon and trigger chip step through rising, falling, any edge, high, low and back to none

## 2. Name the condition on the trigger button

- [x] 2.1 In `Waveform.tsx`, when a channel has a condition, show its name ("Rising", "Falling", "Any edge", "High", "Low") next to the icon on the trigger button, and use the same name in the tooltip. In `styles.css`, let the active button widen to fit the text. Verify `npm run typecheck` passes
- [x] 2.2 In `Waveform.tsx`, change the `edge` icon in `TRIGGER_ICON` from `Zap` to `ArrowUpDown`, so ⚡ only means "no trigger set / set trigger". Verify `npm run typecheck` passes
- [x] 2.3 In `Waveform.tsx`, add a `TRIGGER_HINT` table and use it in the trigger button's tooltip: with a condition set, explain what it means; with none set, list every condition with its meaning. Draw the tooltip in the app (a fixed-position `.trig-tip` shown on hover) rather than with a native `title`, which didn't show in the app. Verify `npm run typecheck` passes
- [x] 2.4 Verify in the running app (same check): with a condition set, the button shows its name, the tooltip explains the condition, and "Any edge" shows ↕ rather than ⚡; with none set, the button is the bare ⚡ shown only on hover, and its tooltip lists every condition

## 3. Verify and archive

- [ ] 3.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 3.2 Run the `openspec-verify-change` skill against `10-trigger-cycle-any-edge` and resolve anything it flags
- [ ] 3.3 Run the `openspec-archive-change` skill to archive the change and update `openspec/specs/trigger/spec.md`
