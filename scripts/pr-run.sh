#!/usr/bin/env bash
# Run a PR's app on this machine without touching this checkout.
#   npm run pr <PR> [npm script]   check out and run the PR (default script: dev)
#   npm run pr clean               remove the review worktree
# Uses one reusable worktree next to this checkout (<checkout>-review), so
# switching PRs only reinstalls dependencies when the lockfile changed and
# rebuilds what changed, sharing this checkout's cargo target dir. Prints the
# PR's CI status and its "Not verified" list, the things to check by hand, then
# runs the app. Works for PRs from forks too.
set -euo pipefail

main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
dir="$main-review"
arg=${1:?usage: npm run pr <PR> [npm script] | npm run pr clean}

if [ "$arg" = clean ]; then
  [ -d "$dir" ] && git -C "$main" worktree remove --force "$dir"
  git -C "$main" worktree prune
  echo "Removed $dir"
  exit 0
fi

pr=$arg
script=${2:-dev}
git -C "$main" fetch -q origin "pull/$pr/head"
sha=$(git -C "$main" rev-parse FETCH_HEAD)
if [ -d "$dir" ]; then
  # Fails, rather than discarding them, if you edited files in the worktree.
  git -C "$dir" checkout -q --detach "$sha"
else
  git -C "$main" worktree add -q --detach "$dir" "$sha"
fi

gh pr view "$pr" --json number,title,url,isDraft,body --template \
  '#{{.number}} {{.title}}{{if .isDraft}} (draft){{end}}
{{.url}}
' 
echo "Checked out ${sha:0:7} at $dir"
echo
gh pr checks "$pr" 2>/dev/null | cut -f1,2 | column -t || true
# The PR body's "Not verified" section, without template comments.
todo=$(gh pr view "$pr" --json body -q .body | tr -d '\r' \
  | awk '/^## /{on=($0 ~ /^## Not verified/); next} on' \
  | sed '/<!--/,/-->/d' | sed '/^[[:space:]]*$/d')
if [ -n "$todo" ]; then
  printf '\nCheck by hand:\n%s\n' "$todo"
fi
echo

cd "$dir"
lock=$(git hash-object package-lock.json)
if [ "$(cat node_modules/.pr-run-lock 2>/dev/null)" != "$lock" ]; then
  npm ci
  echo "$lock" > node_modules/.pr-run-lock
fi
# npm's allowScripts setting can skip Electron's install script, leaving no binary.
[ -e node_modules/electron/path.txt ] || node node_modules/electron/install.js
if grep -q CARGO_TARGET_DIR scripts/build-native.mjs; then
  export CARGO_TARGET_DIR="$main/target"
fi
npm run "$script" || true

cat <<NEXT

Next, for #$pr:
  merge            gh pr merge $pr --squash --delete-branch
  ask for changes  gh pr comment $pr --body '@claude ...'
NEXT
