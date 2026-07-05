# REZNO Agent Tools

This directory contains lightweight repository tools for the REZNO Agentic Delivery System MVP.

## Orchestrator

Run from the repository root:

```sh
node tools/agents/rezno-orchestrator.mjs help
node tools/agents/rezno-orchestrator.mjs status
node tools/agents/rezno-orchestrator.mjs plan "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs handoff "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs review-local
node tools/agents/rezno-orchestrator.mjs validate
node tools/agents/rezno-orchestrator.mjs close-sprint
```

The orchestrator is intentionally read-only. It uses Node.js standard library APIs and Git metadata to summarize repository state and risk categories.

It does not:

- Modify source files.
- Run Codex.
- Run builds.
- Install packages.
- Commit, push, merge, or deploy.
- Read or print secret values.

## Fast-lane commands

Phase 2 adds fast-lane commands for safe docs/tools work:

- `help` lists available commands.
- `status` prints branch, latest commit, working tree status, comparison base, committed diff files, risk categories, and a CTO-style decision.
- `plan "<task>"` prints a concise sprint plan without editing files.
- `handoff "<task>"` prints a ready-to-copy Codex prompt without running Codex.
- `review-local` reviews the local branch against `origin/main`.
- `validate` runs only safe checks: Node syntax check, `git diff --check`, and safe npm scripts when present.
- `close-sprint` prints a post-merge sync checklist and memory update block.

Before `validate` runs `npm run lint` or `npm run typecheck`, it inspects the matching npm lifecycle scripts (`prelint`, `lint`, `postlint`, `pretypecheck`, `typecheck`, and `posttypecheck`). If any related lifecycle script contains a risky term, the whole command is skipped with a clear reason.

Speed comes from combining compatible safe docs/tools work into one reviewable PR. It never bypasses CTO approval, validation, or merge rules.

## CTO decision labels

Only these labels are supported:

- `APPROVE`
- `APPROVE AFTER SMALL FIX`
- `NEEDS QA GATE`
- `DO NOT MERGE`

Merge still requires explicit CTO approval.
