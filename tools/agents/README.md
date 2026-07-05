# REZNO Agent Tools

This directory contains lightweight repository tools for the REZNO Agentic Delivery System MVP.

## Orchestrator

Run from the repository root:

```sh
node tools/agents/rezno-orchestrator.mjs status
node tools/agents/rezno-orchestrator.mjs handoff
```

The orchestrator is intentionally read-only. It uses Node.js standard library APIs and Git metadata to summarize repository state and risk categories.

It does not:

- Modify source files.
- Run Codex.
- Run builds.
- Install packages.
- Commit, push, merge, or deploy.
- Read or print secret values.

## CTO decision labels

Only these labels are supported:

- `APPROVE`
- `APPROVE AFTER SMALL FIX`
- `NEEDS QA GATE`
- `DO NOT MERGE`

Merge still requires explicit CTO approval.
