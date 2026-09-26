#!/usr/bin/env bash
# Sets the Linear status of the issue synced from GitHub issue N.
#   scripts/linear-status.sh <issue-number> <status>
# Needs LINEAR_API_KEY (a personal API key). When it is unset, prints a notice
# and exits 0, so callers work without Linear; the PR automations in Linear
# still move the issue on draft, ready-for-review and merge.
set -euo pipefail

n=${1:?issue number}
status=${2:?status name}
repo=${REPO:-mtharrison/edgewise}

if [ -z "${LINEAR_API_KEY:-}" ]; then
  echo "LINEAR_API_KEY unset; not setting #$n to $status"
  exit 0
fi

gql() {
  curl -sS --fail https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" -H 'Content-Type: application/json' \
    -d "$(jq -cn --arg q "$1" --argjson v "$2" '{query:$q,variables:$v}')"
}

url="https://github.com/$repo/issues/$n"
read -r issue team < <(gql \
  'query($u:String!){attachmentsForURL(url:$u){nodes{issue{id team{id}}}}}' \
  "$(jq -cn --arg u "$url" '{u:$u}')" |
  jq -er '.data.attachmentsForURL.nodes[0].issue | "\(.id) \(.team.id)"') ||
  { echo "No Linear issue is synced from $url" >&2; exit 1; }

state=$(gql \
  'query($t:ID!,$s:String!){workflowStates(filter:{team:{id:{eq:$t}},name:{eq:$s}}){nodes{id}}}' \
  "$(jq -cn --arg t "$team" --arg s "$status" '{t:$t,s:$s}')" |
  jq -er '.data.workflowStates.nodes[0].id') ||
  { echo "No status named $status in the Linear team" >&2; exit 1; }

gql 'mutation($i:String!,$s:String!){issueUpdate(id:$i,input:{stateId:$s}){success}}' \
  "$(jq -cn --arg i "$issue" --arg s "$state" '{i:$i,s:$s}')" |
  jq -e '.data.issueUpdate.success' >/dev/null
echo "#$n → $status"
