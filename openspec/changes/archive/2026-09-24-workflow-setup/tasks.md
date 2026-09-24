## 1. Prerequisites

- [x] 1.1 Archive `baseline-specs` and confirm `openspec/specs/` holds its seven capabilities
- [x] 1.2 Maintainer runs `gh auth refresh -s project`; confirm `gh project list` works

## 2. GitHub setup

- [x] 2.1 Turn on Discussions
- [x] 2.2 Create labels `needs-triage`, `ready`, `spec-approved`, `epic`
- [x] 2.3 Create a public Projects board linked to the repo with Status values Inbox, Ready, Proposed, Building, In review, Done; auto-add off (the built-in "item closed → Done" workflow can't be enabled through the API; board-sync covers it)
- [x] 2.4 Create one epic issue per capability (`devices`, `acquisition`, `trigger`, `decoders`, `capture-files`, `waveform-view`, `app-shell`, `dev-workflow`), each labelled `epic` and added to the board

## 3. Repo files

- [x] 3.1 Add `.github/ISSUE_TEMPLATE/bug.yml` and `feature.yml` (both apply `needs-triage`, feature asks for acceptance criteria) and `config.yml` (blank issues off, link to Discussions)
- [x] 3.2 Add `.github/pull_request_template.md` with `Closes #`, change name, and gate checklist (spec approved, verified, archived)
- [x] 3.3 Add `@fission-ai/openspec` to `devDependencies`, pinned
- [x] 3.4 Add `.github/workflows/ci.yml`: on PR and push to `main`, run `npx openspec validate --all --strict`, `npm run typecheck`, `npm test`
- [x] 3.5 Add `.github/workflows/board-sync.yml`: on label, ready-for-review and merge events, set the board Status using `PROJECT_TOKEN`; never check out PR code
- [x] 3.6 Fill `openspec/config.yaml` with project context and rules (proposal links its issue and includes Non-goals; tasks include tests; change name is `<issue>-<slug>`)

## 4. Pickup skill

- [x] 4.1 Write `.claude/skills/backlog-pickup/SKILL.md`: select a Ready, unassigned, unblocked item; check that a collaborator applied `ready`; take requirements only from collaborator-written text; claim; run `/opsx:propose`; open a draft PR; stop
- [x] 4.2 Add the second phase: after a collaborator applies `spec-approved`, run `/opsx:apply`, `/opsx:verify`, `/opsx:archive`, then mark the PR ready for review
- [x] 4.3 Make the skill refuse to apply `ready` or `spec-approved`, or merge

## 5. Seed and verify

- [x] 5.1 File the follow-ups from `baseline-specs` design.md (#9–#16) as sub-issues of their epics, add them to the board as Inbox
- [x] 5.2 Move the steps that need the merged PR or the maintainer (PROJECT_TOKEN secret, dry run, outsider test, branch protection) to issue #17
- [x] 5.3 Verify and archive this change
