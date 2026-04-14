#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

WORKFLOW_NAME="Build Windows"
WORKFLOW_FILE="build-windows.yml"
REF="master"
ARTIFACT_NAME="windows-installer"
DOWNLOAD_DIR="artifacts"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI is not installed. Install GitHub CLI to continue." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

mkdir -p "$DOWNLOAD_DIR"

echo "Triggering workflow '$WORKFLOW_NAME' on ref '$REF'..."
RUN_OUTPUT=$(gh workflow run "$WORKFLOW_NAME" --ref "$REF")
RUN_ID=$(printf '%s' "$RUN_OUTPUT" | sed -nE 's#.*/actions/runs/([0-9]+).*#\1#p')

if [[ -z "$RUN_ID" ]]; then
  echo "Error: could not determine workflow run ID." >&2
  echo "$RUN_OUTPUT"
  exit 1
fi

echo "Started workflow run ID: $RUN_ID"

echo "Waiting for workflow completion..."
while true; do
  STATUS=$(gh run view "$RUN_ID" --json status --jq '.status')
  echo "  status=$STATUS"

  if [[ "$STATUS" == "completed" ]]; then
    break
  fi

  sleep 15
 done

CONCLUSION=$(gh run view "$RUN_ID" --json conclusion --jq '.conclusion')
echo "Workflow completed with conclusion: $CONCLUSION"

if [[ "$CONCLUSION" != "success" ]]; then
  echo "Error: workflow did not succeed." >&2
  exit 1
fi

echo "Downloading artifact '$ARTIFACT_NAME' into '$DOWNLOAD_DIR'..."
gh run download "$RUN_ID" --name "$ARTIFACT_NAME" --dir "$DOWNLOAD_DIR"

echo "Artifact download complete. Files saved under: $DOWNLOAD_DIR"
