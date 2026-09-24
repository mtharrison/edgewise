# Tasks

## 1. Add "Any edge" to the trigger cycle

- [ ] 1.1 In `src/renderer/src/actions.ts`, change `TRIGGER_CYCLE` to `[null, 'rising', 'falling', 'edge', 'high', 'low']`, and verify `npm run typecheck` passes
- [ ] 1.2 Add a `cycleTrigger` test to `src/renderer/src/actions.test.ts` covering both spec scenarios: starting from none, six clicks give rising, falling, edge, high, low, none; and one click from falling gives edge, without changing other channels' conditions. Verify `npx vitest run` passes
- [ ] 1.3 Manually verify in the running app (`npm run dev`, or a CDP-driven check per `EDGEWISE_CDP_PORT`): click a channel's trigger button repeatedly and confirm the icon and trigger chip step through rising, falling, any edge, high, low and back to none

## 2. Verify and archive

- [ ] 2.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 2.2 Run the `openspec-verify-change` skill against `10-trigger-cycle-any-edge` and resolve anything it flags
- [ ] 2.3 Run the `openspec-archive-change` skill to archive the change and update `openspec/specs/trigger/spec.md`
