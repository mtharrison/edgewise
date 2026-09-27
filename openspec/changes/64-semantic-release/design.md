# Design

## Context

`release.yml` today runs on `v*` tags: a four-OS build matrix packages installers (macOS signed and notarized when secrets are present), then a `release` job runs `gh release create --generate-notes`. The version lives only in `package.json` (`0.1.1`, tagged `v0.1.1`). Commits on `main` are plain sentences squash-merged with a `(#NN)` suffix, so semantic-release's default Conventional Commits analyzer would find nothing to release.

## Goals / Non-Goals

**Goals:** version, changelog, tag and release decided by merging to `main`; installer filenames carry the new version; hand-run test builds keep working; the rule for marking a PR is written down for people and agents.

**Non-Goals:** see the proposal.

## Decisions

### PR labels decide the bump

Of the issue's three options, labels are the only one that keeps the house commit style, survives squash merge without extra plumbing at merge time, and can be changed after the PR is open. Labels: `release:major`, `release:minor`, `release:patch`; none means no release. If a PR somehow carries more than one, the largest wins.

*Alternatives:* Conventional Commit prefixes (changes house style, needs a PR-title lint); branch names (lost after squash merge).

### A local semantic-release plugin reads the labels

A small ESM plugin (`scripts/release-labels.mjs`) implements two semantic-release steps:

- `analyzeCommits`: for each commit since the last release, take the PR number from the trailing `(#NN)` in the subject, fetch the PR's labels through the GitHub API (`GITHUB_TOKEN`), map them to `major`/`minor`/`patch`, and return the largest, or `null` for no release. Commits with no `(#NN)` (for example the release commit itself) are ignored.
- `generateNotes`: one line per released PR, `- <PR title> (#NN)`, under a `## <version> (<date>)` heading, in merge order.

Keeping the lookup and the notes in one pure-ish module means both can be unit-tested with vitest by injecting a fake label lookup. This avoids depending on a third-party label plugin whose maintenance is uncertain, and avoids a "fold the label into the commit body" step at merge time.

The plugin chain in the release config is: local plugin (analyze + notes) → `@semantic-release/changelog` (`CHANGELOG.md`) → `@semantic-release/npm` with `npmPublish: false` (bumps `package.json` and `package-lock.json`) → `@semantic-release/git` (commits both files with `Release vX.Y.Z [skip ci]`) → `@semantic-release/github` (release with `installers/*` as assets). Tag format `v${version}`, so the existing `v0.1.1` tag is the starting point.

### Workflow shape

```
push to main ─► version (dry run) ─► build ×4 (npm version --no-git-tag-version X) ─► release (real run)
                   │ nothing to release
                   └─► build and release skipped, workflow green
workflow_dispatch ─► build ×4 with package.json version, upload artifacts, no release
```

- `version` job: checkout with full history and tags, `npx semantic-release --dry-run`, expose `version` as a job output (read from semantic-release's `nextRelease` via a tiny wrapper, or by parsing its output). Runs only on `main`.
- `build` job: `if: github.event_name == 'workflow_dispatch' || needs.version.outputs.version != ''`. When a version is set, run `npm version <v> --no-git-tag-version` before packaging so installer filenames match. The tag-check step is removed.
- `release` job: downloads the installers into `installers/`, runs semantic-release for real. Runs only on push to `main` with a version.
- `concurrency: { group: release, cancel-in-progress: false }` so two quick merges don't race. If `main` moved between the dry run and the real run, semantic-release refuses to release from a stale checkout; the next run (from the newer push) picks the pending PRs up, so nothing is lost. The real run's computed version is compared to the dry run's and the job fails loudly if they differ, so installers are never attached to a release whose number they don't carry.
- The release commit carries `[skip ci]` so it does not trigger another release run or CI.

### Pushing to protected `main`

The release job must push a commit and a tag to `main`, which is protected to accept changes only through PRs. `GITHUB_TOKEN` can't bypass that. Options, in order of preference:

1. A GitHub App (or fine-grained token) added to the ruleset's bypass list, its token used only in the `release` job.
2. Not committing to `main` at all (changelog and version only in the release/tag). Rejected: the issue's acceptance criteria require `CHANGELOG.md` and `package.json` on `main`.

This is a maintainer-side setting; the implementation will document the secret it expects (`RELEASE_TOKEN`) and the PR will list the bypass under "Not verified". The `dev-workflow` CI checks requirement is amended to allow exactly this commit.

### Where the rule is documented

The issue asks for docs "next to the existing backlog flow", but `docs/` holds only images today; the flow itself lives in `openspec/specs/dev-workflow/spec.md` and `.claude/skills/backlog-pickup/SKILL.md`. So: add `docs/releasing.md` (the human-readable rule), reference the labels in the dev-workflow spec (this change), and add a line to the backlog-pickup skill and the PR template so agents and contributors apply a label when opening a PR. Agents may apply release labels (they are not gate labels like `ready`/`spec-approved`); the maintainer can change the label before merging.

## Risks / Trade-offs

- **Forgotten label → no release.** Intentional (no label means no release), but easy to miss. Mitigation: PR template checkbox; a later PR can cut a release, since the largest pending bump wins across all PRs since the last tag.
- **Labels changed after merge** affect the next release computation, since labels are read at release time. Acceptable; documented.
- **Dry-run/real-run mismatch** if `main` moves: guarded by concurrency plus the explicit version comparison.
- **Release token scope:** a bypass token is powerful. Keep it to the `release` job only, with `contents: write`.
- **Build minutes:** the dry-run job adds a short Ubuntu job to every push to `main`; the expensive matrix runs only when there is something to release.

## Follow-up issue candidates

- Auto-update feeds for electron-builder.
- A CI check that warns on PRs with no release label (informational, not blocking).
