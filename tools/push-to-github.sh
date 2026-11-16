#!/usr/bin/env bash
# One-command GitHub publish for WebDesk.
#
# The bundled GitHub App token can PUSH to repos but cannot CREATE a new repo
# (GitHub returns "403 Resource not accessible by integration"). Once the GitHub
# connector is re-authorized with repo-creation permission (or a PAT is supplied),
# run this script to create yinbo3211/webdesk and push the local commit.
#
# Usage:
#   bash tools/push-to-github.sh
#   GITHUB_TOKEN=<classic PAT with repo scope> bash tools/push-to-github.sh
set -euo pipefail

OWNER="${GITHUB_OWNER:-yinbo3211}"
REPO="${GITHUB_REPO:-webdesk}"
BRANCH="main"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 1. Obtain a token (unless the caller supplied a PAT directly).
if [ -z "${GITHUB_TOKEN:-}" ]; then
  # shellcheck disable=SC1091
  source /root/.codebuddy/skills/github-connector/scripts/get_token.sh github >/dev/null 2>&1 || true
fi
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "No GitHub token available. Re-authorize the GitHub connector in Settings > Connectors," >&2
  echo "or pass a classic PAT: GITHUB_TOKEN=<token> bash tools/push-to-github.sh" >&2
  exit 1
fi

api() { curl -sS -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" "$@"; }

# 2. Create the repository if it does not exist yet.
code=$(api -o /tmp/wd_repo_check.json -w "%{http_code}" "https://api.github.com/repos/${OWNER}/${REPO}" || true)
if [ "$code" = "200" ]; then
  echo "Repository ${OWNER}/${REPO} already exists; will push into it."
else
  echo "Creating repository ${OWNER}/${REPO} ..."
  resp=$(api -X POST "https://api.github.com/user/repos" \
    -d "{\"name\":\"${REPO}\",\"description\":\"WebDesk - Apple-style web desktop launcher with 7-language global i18n and RTL. Built from PRD V2.0.\",\"private\":false,\"auto_init\":false}")
  if echo "$resp" | grep -q '"full_name"'; then
    echo "Created: https://github.com/${OWNER}/${REPO}"
  else
    echo "Create failed (the token still lacks repo-creation permission):" >&2
    echo "$resp" | python3 -c "import json,sys;print(json.load(sys.stdin).get('message','unknown'))" 2>/dev/null || echo "$resp" >&2
    echo >&2
    echo "Fix: in CodeBuddy Settings > Connectors, re-authorize GitHub and grant repository" >&2
    echo "creation permission; or use a classic PAT with the 'repo' scope." >&2
    exit 1
  fi
fi

# 3. Push the existing local commit.
git branch -M "$BRANCH" 2>/dev/null || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://oauth2:${GITHUB_TOKEN}@github.com/${OWNER}/${REPO}.git"
git push -u origin "$BRANCH" --force-with-lease
# Scrub the token from the stored remote URL.
git remote set-url origin "https://github.com/${OWNER}/${REPO}.git"
echo
echo "Done -> https://github.com/${OWNER}/${REPO}"
