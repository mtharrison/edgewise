## Why

Work on Edgewise should be visible from one place, specs should build on each other, and people and agents should be able to pick up work once it is approved. The repo is public, so anyone can open issues, but only maintainers should decide what enters the backlog.

## What Changes

- A GitHub Projects board acts as the backlog, with statuses Inbox → Ready → Proposed → Building → In review → Done.
- Epics map one-to-one to spec capabilities. Each sub-issue becomes one OpenSpec change named `<issue>-<slug>`.
- Two human review gates: spec approval before implementation, then code review. Archiving happens in the same PR as the code.
- Public intake: issue forms that apply `needs-triage`, blank issues turned off, questions routed to Discussions.
- Agents pick up only Ready, unblocked, unassigned work that a collaborator approved, and treat text written by outsiders as untrusted.
- CI checks OpenSpec validity and runs the tests on every PR. `main` requires a PR.
- `openspec/config.yaml` gains project context and rules that enforce the conventions above.
- Follow-ups from `baseline-specs` are filed as the first backlog issues.

## Capabilities

### New Capabilities
- `dev-workflow`: how work moves from issue to archived spec, including intake, readiness, change naming, review gates, agent pickup rules, and CI checks.

### Modified Capabilities

None.

## Impact

- New files: `.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`, `.github/workflows/*`, a pickup skill under `.claude/skills/`.
- Edits `openspec/config.yaml`.
- GitHub settings: Discussions on, a Projects board linked to the repo, labels, branch protection on `main`.
- Requires the `gh` CLI to have the `project` scope (`gh auth refresh -s project`).
- Depends on `baseline-specs` being archived first, so epics have capabilities to map to.
