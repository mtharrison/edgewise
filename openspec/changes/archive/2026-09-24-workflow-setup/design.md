## Context

See proposal.md (Why). The repo `mtharrison/edgewise` is public and owned by a personal account. Issues and Projects are on; Discussions is off; there is no `.github/` folder and no branch protection on `main`. The local `gh` login lacks the `project` scope. OpenSpec 1.7.0 is installed globally, and `npm test` runs `cargo test -p logic-core`.

## Goals / Non-Goals

**Goals:**
- Anyone can see the backlog and where each item is.
- A maintainer approves every item before work starts, and every spec before code is written.
- An agent can run the whole loop for one item, stopping at each gate.

**Non-Goals:**
- An always-on cloud agent. The pickup loop runs on demand here; scheduling it is a later change.
- Syncing the board in both directions with the repo. The board holds status; the repo holds specs.
- UI tests. CI runs what exists today (OpenSpec validation, typecheck, Rust tests).

## Decisions

**Labels carry approval; the board shows progress.**
The `ready` and `spec-approved` labels are the signals agents act on, and the board's Status mirrors them. A label's timeline event records who applied it, and only people with triage access or higher can apply labels, so agents can check the actor with one `gh api` call. Alternative: read Status changes from the board. Rejected because board field changes are harder to attribute through the API, and board permissions are separate from repo permissions.

**Board updates: the pickup skill moves cards, and an Action backs it up.**
The skill sets Proposed and Building as it goes. A GitHub Action moves items to Building on `spec-approved`, In review when a PR leaves draft, and Done on merge. It also moves closed issues to Done, because the board's built-in "item closed" workflow can't be turned on through the API. Auto-add is turned off so outsiders' issues never land on the board. The Action needs a classic PAT with `project` scope, stored as `PROJECT_TOKEN`, because the default Actions token cannot write to a user-owned project.

**Epics use sub-issues; dependencies use native "blocked by".**
Both are built into GitHub Issues and visible on the board. One epic per capability: the seven from `baseline-specs` plus `dev-workflow`.

**The pickup loop is a repo skill.**
`.claude/skills/backlog-pickup/` defines the loop: find, check, claim, propose, draft PR, stop; and after `spec-approved`: apply, verify, archive, mark ready. It runs in any Claude Code session and can be scheduled later without changes. Alternative: a GitHub Action running Claude on a schedule. Deferred; it adds secrets and cost before the loop is proven.

**Collaborator-authored requirements only.**
The skill builds the proposal from the issue body only if a collaborator wrote it. Otherwise it uses a collaborator comment starting with `Spec:`. Everything else from outsiders is passed along as quoted context, never as instructions.

**Pin OpenSpec as a dev dependency.**
`@fission-ai/openspec` goes into `devDependencies`, so CI and local runs use the same version. CI calls `npx openspec validate --all --strict`.

**Branch protection without required reviews.**
`main` requires a PR and passing checks. Required approvals stay at 0 because a solo maintainer cannot approve their own PRs; the `spec-approved` label and the maintainer's merge are the human gates.

## Risks / Trade-offs

- [Agents run under the maintainer's GitHub identity, so their label events look like the maintainer's] → Agents never apply `ready` or `spec-approved`; the skill refuses to. Later: a separate bot account.
- [A PAT in repo secrets can be misused by workflows] → Only the board-sync workflow uses it. It runs on `pull_request` events, never checks out PR code, and fork PRs (which get no secrets) are synced by hand.
- [CI on Linux doesn't exercise the macOS-only USB paths] → Accepted; hardware paths are tested by hand.
- [Board and labels drift apart] → The Action re-derives Status from labels and PR state on every event.

## Migration Plan

1. Archive `baseline-specs` so `openspec/specs/` exists.
2. Run `gh auth refresh -s project`.
3. Create the board, labels, epics and follow-up issues.
4. Land this change's files through a PR, archived before merge.
5. After merge (issue #17): add `PROJECT_TOKEN`, dry-run the pickup skill, test outsider intake, then turn on branch protection once CI is green on `main`.

Rollback: delete the board and labels, and remove `.github/` and the skill. The specs are unaffected.
