# Proposal

## Why

Delivers #64. Releasing is manual: someone bumps `version` in `package.json`, commits, tags `vX.Y.Z` and pushes the tag. Nothing decides what the next version should be, there is no `CHANGELOG.md`, and a tag that doesn't match `package.json` fails the Release workflow late, after the installers are built. This belongs to the Dev workflow epic (Epic #8, capability `dev-workflow`).

## What Changes

- Adopt semantic-release so that merging a PR to `main` decides the next version, updates `CHANGELOG.md` and `package.json` on `main`, tags `vX.Y.Z`, and publishes a GitHub release with the four installers attached. No hand-edited versions or tags.
- A PR says what kind of release it is with a **PR label**: `release:major`, `release:minor` or `release:patch`. A merged PR with no release label produces no release. This is the issue's recommended option; it keeps the plain-sentence squash-commit style and fits the existing label-driven flow.
- A small local semantic-release plugin reads the label off the merged PR (found through the `(#NN)` suffix of the squash commit) to decide the bump, and writes release notes with one line per merged PR and its number. The same notes go into `CHANGELOG.md` and the GitHub release, replacing `--generate-notes`.
- `release.yml` runs on pushes to `main` (plus `workflow_dispatch` for unsigned test builds, as today): a first job computes the next version or ends early, the build matrix packages with that version injected, and a final job runs the real release and uploads the installers. The "Tag matches package.json version" step goes away.
- The three release labels are created in the repo.
- A new `docs/releasing.md` explains how to mark a PR for a major, minor or patch release, and the backlog-pickup skill tells agents to apply the label to the PRs they open.

### Non-goals

- Publishing to npm (the package is private).
- Auto-update feeds for electron-builder (possible follow-up).
- Conventional Commits or branch-name conventions (options 2 and 3 in the issue).
- Pre-release channels (beta/next branches).
- Any change to how installers are built, signed or notarized.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dev-workflow`: adds a requirement that releases are cut automatically from `main` based on PR release labels, with a changelog; the CI checks requirement allows the release job's own version-and-changelog commit to land on `main` without a PR.

## Impact

- `.github/workflows/release.yml`: new trigger and job shape.
- New `.releaserc` (or `release.config.mjs`) and a local plugin under `scripts/`, with vitest tests.
- `package.json` / `package-lock.json`: dev dependencies `semantic-release`, `@semantic-release/changelog`, `@semantic-release/git`, `@semantic-release/github`.
- New `CHANGELOG.md` (written by the first release).
- New `docs/releasing.md`; `.claude/skills/backlog-pickup/SKILL.md` and `.github/pull_request_template.md` mention the release label.
- Repo settings: `main`'s protection must let the release job push its commit and tag (see design).
