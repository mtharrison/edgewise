## ADDED Requirements

### Requirement: Releases from main
Merging a PR to `main` SHALL decide whether a release happens, from the PR's release label: `release:major`, `release:minor` or `release:patch` bump the matching part of the version, and no release label means no release. When several merged PRs are waiting to be released, the largest bump among them SHALL win. A release SHALL, with no manual step, set `package.json`'s `version` on `main` to the new version, add an entry for it to `CHANGELOG.md` on `main` listing each merged PR with its number, tag `v<version>`, and publish a GitHub release whose notes match the changelog entry and which has the macOS (Apple silicon and Intel), Linux and Windows installers attached, named with the new version. How to mark a PR for a release SHALL be documented in `docs/`.

#### Scenario: PR with a release label
- **WHEN** a PR labelled `release:minor` is merged to `main` while the latest release is `v0.1.1`
- **THEN** a GitHub release `v0.2.0` is created with all four installers attached, `package.json` on `main` has version `0.2.0`, and `CHANGELOG.md` on `main` has a `0.2.0` entry listing that PR by number, matching the release notes

#### Scenario: PR with no release label
- **WHEN** a PR with no release label is merged to `main`
- **THEN** no release, tag or version change happens and the release workflow finishes green

#### Scenario: Largest bump wins
- **WHEN** a `release:patch` PR and a `release:major` PR are both merged since the last release
- **THEN** the next release bumps the major version and its changelog entry lists both PRs

#### Scenario: Test build by hand
- **WHEN** a maintainer runs the release workflow by hand on a branch
- **THEN** it produces unsigned installers as workflow artifacts and creates no release, tag or commit

#### Scenario: Reading the docs
- **WHEN** a contributor or agent reads `docs/`
- **THEN** it states which label marks a PR for a major, minor or patch release, and that no label means no release

## MODIFIED Requirements

### Requirement: CI checks
Every PR SHALL run `openspec validate --all --strict` and the project's tests, and SHALL launch the built app to confirm it starts. `main` SHALL accept changes only through PRs with passing checks, except for the release workflow's own commit that updates `package.json`'s version and `CHANGELOG.md` for a release.

#### Scenario: Invalid spec
- **WHEN** a PR contains a delta spec with a requirement that has no scenario
- **THEN** the CI check fails and the PR cannot merge

#### Scenario: App fails to start
- **WHEN** a PR's build produces an app whose window never renders
- **THEN** the CI check fails and the PR cannot merge

#### Scenario: Release commit
- **WHEN** a release is published
- **THEN** its version-and-changelog commit is on `main` without a PR, and no other direct push to `main` is accepted
