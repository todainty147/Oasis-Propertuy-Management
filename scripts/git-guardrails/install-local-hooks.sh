#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

chmod +x scripts/git-guardrails/block-dangerous-git-command.sh
chmod +x scripts/git-guardrails/install-local-hooks.sh
chmod +x .githooks/pre-push

git config core.hooksPath .githooks

echo "Installed repo-local Git hooks."
echo "core.hooksPath is now set to .githooks"
echo
echo "Optional agent/tool guard:"
echo "Use scripts/git-guardrails/block-dangerous-git-command.sh as a pre-command hook for local AI tooling."
