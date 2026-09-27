#!/usr/bin/env bash
# Publishes screenshots and GIFs so a PR description can embed them.
#   scripts/pr-media.sh <pr-number> <file>...
# Commits the files to the orphan `pr-media` branch under <pr>/<timestamp>/ and
# prints one Markdown image line per file, ready to paste into the PR body.
# The branch holds only media (never merged); the app repo stays small.
set -euo pipefail

pr=${1:?pr number}; shift
[ $# -gt 0 ] || { echo "usage: scripts/pr-media.sh <pr-number> <file>..." >&2; exit 1; }
repo=${REPO:-mtharrison/edgewise}
branch=pr-media
dest="$pr/$(date -u +%Y%m%d-%H%M%S)"

git config user.name >/dev/null || export GIT_AUTHOR_NAME=edgewise-ci GIT_COMMITTER_NAME=edgewise-ci
git config user.email >/dev/null || export GIT_AUTHOR_EMAIL=ci@edgewise.invalid GIT_COMMITTER_EMAIL=ci@edgewise.invalid

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export GIT_INDEX_FILE="$tmp/index"

for attempt in 1 2 3; do
  parent=""
  if git fetch -q origin "$branch" 2>/dev/null; then
    parent=$(git rev-parse FETCH_HEAD)
    git read-tree "$parent"
  else
    rm -f "$GIT_INDEX_FILE"
    readme=$(printf '# PR media\n\nScreenshots and GIFs embedded in pull request descriptions, one folder per PR.\nWritten by `scripts/pr-media.sh`; never merged.\n' | git hash-object -w --stdin)
    git update-index --add --cacheinfo "100644,$readme,README.md"
  fi
  for f in "$@"; do
    blob=$(git hash-object -w "$f")
    git update-index --add --cacheinfo "100644,$blob,$dest/$(basename "$f")"
  done
  tree=$(git write-tree)
  commit=$(git commit-tree "$tree" ${parent:+-p "$parent"} -m "Media for PR #$pr")
  if git push -q origin "$commit:refs/heads/$branch" 2>"$tmp/push.err"; then break; fi
  cat "$tmp/push.err" >&2
  [ "$attempt" -lt 3 ] || { echo "push to $branch failed" >&2; exit 1; }
  sleep 2
done

for f in "$@"; do
  name=$(basename "$f"); name=${name%.*}
  echo "![$name](https://raw.githubusercontent.com/$repo/$branch/$dest/$(basename "$f"))"
done
