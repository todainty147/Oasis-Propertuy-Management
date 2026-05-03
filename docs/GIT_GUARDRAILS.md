# Git Guardrails

This repo includes lightweight Git guardrails to reduce the chance of destructive local actions and direct pushes to protected branches.

## What is included

### 1. Repo-local `pre-push` hook

File:
- [pre-push](/mnt/c/Users/Home/oasisrentalmanagementapp/.githooks/pre-push)

Behavior:
- blocks direct pushes to:
  - `main`
  - `master`
  - `production`
- encourages PR-based flow instead

One-off override:

```bash
OASIS_ALLOW_PROTECTED_PUSH=1 git push
```

Use that only when you intentionally want to bypass the local protection.

### 2. Agent / tool command guard

File:
- [block-dangerous-git-command.sh](/mnt/c/Users/Home/oasisrentalmanagementapp/scripts/git-guardrails/block-dangerous-git-command.sh)

Behavior:
- reads tool-hook stdin
- extracts a proposed command from JSON when present
- blocks dangerous Git actions like:
  - `git push`
  - `git reset --hard`
  - `git clean -fd`
  - `git branch -D`
  - `git checkout .`
  - `git restore .`
  - force push variants

This is meant for local AI/tool hook integration, similar to pre-command hooks used by coding agents.

## Install the local Git hooks

Run:

```bash
npm run guardrails:install
```

That sets:

```bash
git config core.hooksPath .githooks
```

for your local clone.

## Suggested agent integration

Use this script as a pre-command / tool guard in local AI tooling:

```bash
scripts/git-guardrails/block-dangerous-git-command.sh
```

The script is repo-local on purpose so the team can review and evolve the rule set in Git.

## Important limits

These guardrails help, but they do not replace:
- GitHub branch protection
- required status checks
- code review
- secret rotation if something sensitive was already committed

They also do not rewrite history or clean up previously tracked secrets automatically.
