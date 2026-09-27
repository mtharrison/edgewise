#!/usr/bin/env bash
# Prints the ID (e.g. MAT-34) of the Linear issue synced with GitHub issue N, so
# the PR for N can name it and Linear links the PR to the issue.
#   scripts/linear-id.sh <issue-number>
# Needs LINEAR_API_KEY (a read-only personal API key is enough). Without it, or
# when no Linear issue is synced with N, prints nothing and exits 0: the PR still
# closes the GitHub issue, and the sync then marks the Linear issue Done.
# Exits non-zero if the Linear API call fails.
set -euo pipefail

n=${1:?issue number}
repo=${REPO:-mtharrison/edgewise}
url="https://github.com/$repo/issues/$n"

if [ -z "${LINEAR_API_KEY:-}" ]; then
  echo "LINEAR_API_KEY unset; not looking up the Linear issue for #$n" >&2
  exit 0
fi

query='query($u:String!){attachmentsForURL(url:$u){nodes{issue{identifier}}}}'
resp=$(curl -sS --fail https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" -H 'Content-Type: application/json' \
  -d "$(jq -cn --arg q "$query" --arg u "$url" '{query:$q,variables:{u:$u}}')")
if jq -e '.errors' <<<"$resp" >/dev/null; then
  echo "Linear API error: $(jq -c '.errors' <<<"$resp")" >&2
  exit 1
fi

id=$(jq -r '.data.attachmentsForURL.nodes[0].issue.identifier // empty' <<<"$resp")
if ! [[ $id =~ ^[A-Z][A-Z0-9]*-[0-9]+$ ]]; then
  echo "No Linear issue is synced with $url" >&2
  exit 0
fi
echo "$id"
