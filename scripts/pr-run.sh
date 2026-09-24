#!/usr/bin/env bash
# Run the app from a PR without touching this checkout: scripts/pr-run.sh <PR> [npm script]
# Checks out the PR head in a sibling worktree (<checkout>-pr-<PR>), installs deps
# if the lockfile changed, and runs the npm script (default: dev). Shares this
# checkout's cargo target dir when the PR's build script supports it.
# Remove with: git worktree remove ../<checkout>-pr-<PR>
set -euo pipefail

pr=${1:?usage: scripts/pr-run.sh <PR> [npm script]}
script=${2:-dev}
root=$(git rev-parse --show-toplevel)
dir="$root-pr-$pr"

branch=$(gh pr view "$pr" --json headRefName -q .headRefName)
git -C "$root" fetch -q origin "$branch"
sha=$(git -C "$root" rev-parse FETCH_HEAD)
if [ -d "$dir" ]; then
  git -C "$dir" checkout -q --detach "$sha"
else
  git -C "$root" worktree add -q --detach "$dir" "$sha"
fi
echo "#$pr ($branch @ ${sha:0:7}) at $dir"

cd "$dir"
[ node_modules/.package-lock.json -nt package-lock.json ] 2>/dev/null || npm ci
if grep -q CARGO_TARGET_DIR scripts/build-native.mjs; then
  export CARGO_TARGET_DIR="$root/target"
fi
npm run "$script"
