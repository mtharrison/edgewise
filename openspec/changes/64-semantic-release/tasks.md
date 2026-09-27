# Tasks

## 1. Label-driven release plugin

- [ ] 1.1 Add dev dependencies `semantic-release`, `@semantic-release/changelog`, `@semantic-release/git` and `@semantic-release/github` (and `@semantic-release/npm` if not pulled in), and verify `npm ci` and `npm run typecheck` pass
- [ ] 1.2 Write `scripts/release-labels.mjs` with `analyzeCommits` (PR number from the trailing `(#NN)`, labels via the GitHub API, largest of `release:major`/`minor`/`patch`, `null` when none) and `generateNotes` (`## <version> (<date>)` then `- <title> (#NN)` per released PR), with the label lookup injectable
- [ ] 1.3 Add vitest tests covering: one labelled PR gives its bump; no labels gives no release; patch + major gives major; a PR with two release labels gives the larger; commits with no `(#NN)` are ignored; notes list every released PR with its number in merge order
- [ ] 1.4 Add the release config (`release.config.mjs`): branch `main`, tag format `v${version}`, plugin chain local plugin → changelog → npm (`npmPublish: false`) → git (`package.json`, `package-lock.json`, `CHANGELOG.md`, message `Release v${nextRelease.version} [skip ci]`) → github (assets `installers/*`)

## 2. Release workflow

- [ ] 2.1 Change `release.yml` triggers to `push: branches: [main]` and `workflow_dispatch`, add `concurrency: { group: release, cancel-in-progress: false }`, and update the header comment
- [ ] 2.2 Add a `version` job (push to `main` only) that checks out full history and tags and runs semantic-release in dry-run, exposing the next version (empty when nothing to release) as an output
- [ ] 2.3 Make `build` depend on `version`, run when dispatched by hand or when a version was computed, inject the version with `npm version <v> --no-git-tag-version` before packaging, and remove the "Tag matches package.json version" step
- [ ] 2.4 Rewrite the `release` job to download installers into `installers/` and run semantic-release for real with `RELEASE_TOKEN`, failing if the version it computes differs from the `version` job's output
- [ ] 2.5 Run the workflow file through `actionlint` (or equivalent) and a local `npx semantic-release --dry-run --no-ci` on a scratch branch against the real history to confirm it reports "no release" for the current unlabelled history and the expected bump when a merged PR is labelled

## 3. Labels and docs

- [ ] 3.1 Create the `release:major`, `release:minor` and `release:patch` labels in the repo (`gh label create`)
- [ ] 3.2 Write `docs/releasing.md`: which label gives which bump, no label means no release, largest pending bump wins, how to run an unsigned test build by hand, and the `RELEASE_TOKEN` bypass the maintainer must set up
- [ ] 3.3 Add a release-label line to `.github/pull_request_template.md` and a step to `.claude/skills/backlog-pickup/SKILL.md` telling agents to apply a release label to the PR they open (and that release labels are not gate labels)

## 4. Verify and archive

- [ ] 4.1 Run `npm test` and `npm run typecheck` and confirm both pass
- [ ] 4.2 List under "Not verified" in the PR: the `RELEASE_TOKEN` ruleset bypass, and an end-to-end release on `main` (labelled merge creates a tagged release with four installers, updated `CHANGELOG.md` and `package.json`; unlabelled merge finishes green with no release)
- [ ] 4.3 Run the `openspec-verify-change` skill against `64-semantic-release` and resolve anything it flags
- [ ] 4.4 Run the `openspec-archive-change` skill to archive the change and update `openspec/specs/dev-workflow/spec.md`
