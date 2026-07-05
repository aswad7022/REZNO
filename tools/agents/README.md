# REZNO Agent Tools

This directory contains lightweight repository tools for the REZNO Agentic Delivery System MVP.

## Orchestrator

Run from the repository root:

```sh
node tools/agents/rezno-orchestrator.mjs help
node tools/agents/rezno-orchestrator.mjs status
node tools/agents/rezno-orchestrator.mjs risk "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs sprint "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs plan "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs handoff "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs review-local
node tools/agents/rezno-orchestrator.mjs pr-body "Agentic Delivery System Phase 3"
node tools/agents/rezno-orchestrator.mjs decision
node tools/agents/rezno-orchestrator.mjs memory "Agentic Delivery System Phase 3"
node tools/agents/rezno-orchestrator.mjs memory-status
node tools/agents/rezno-orchestrator.mjs next
node tools/agents/rezno-orchestrator.mjs audit
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

## Phase 3 sprint runner and review pack

Phase 3 reduces copy/paste by generating complete sprint and review text from local repository state:

- `risk "<goal>"` analyzes task text for risky categories before implementation.
- `sprint "<goal>"` prints a complete execution pack with sprint name, branch suggestion, scope, risk analysis, checks, implementation prompt, PR body template, and decision criteria.
- `pr-body "<sprint name>"` generates a PR body from current branch state without calling GitHub.
- `decision` prints a compact CTO decision report.
- `memory "<sprint name>"` prints a memory update block with placeholders for PR number and final main SHA.

These commands do not run Codex, edit files, call GitHub, merge, deploy, or inspect secrets. They support supervised delivery only.

## Phase 4 memory ledger and next action

Phase 4 adds a repository-local memory ledger:

```sh
node tools/agents/rezno-orchestrator.mjs memory-status
node tools/agents/rezno-orchestrator.mjs record-sprint "Sprint Name" "20" "<40-character-main-sha>" "APPROVE"
node tools/agents/rezno-orchestrator.mjs next
node tools/agents/rezno-orchestrator.mjs audit
node tools/agents/rezno-orchestrator.mjs delegate "Improve REZNO agentic delivery docs safely"
node tools/agents/rezno-orchestrator.mjs gate "Prepare mobile EAS build"
node tools/agents/rezno-orchestrator.mjs operator-pack "Improve REZNO agentic delivery docs safely"
```

The ledger lives at `tools/agents/rezno-agent-memory.json`. Default commands are read-only. `record-sprint` is the only write command, and it may write only to that JSON file. It validates the PR number, main SHA, and CTO decision label before updating the ledger.

The `audit` command checks that `memory.currentApprovedMain` is a valid 40-character SHA, compares it with local `main`, validates all closed sprint records, and flags stale memory with `NEEDS QA GATE`.

The memory ledger is a coordination aid. It does not authorize implementation, merge, deployment, package changes, schema changes, or secret handling.

## Phase 5 delegated sprint mode

Phase 5 adds daily-use delegated sprint commands:

- `delegate "<goal>"` reads memory, reviews repo state, classifies goal risk, and prints the next safe action plus a ready-to-copy Codex prompt.
- `gate "<goal>"` prints a QA/security gate checklist for risky work.
- `operator-pack "<goal>"` prints a full CTO/operator pack with summary, risks, allowed/disallowed actions, prompt, QA checklist, PR checklist, and memory update template.

Daily workflow:

1. Run `node tools/agents/rezno-orchestrator.mjs memory-status`.
2. Run `node tools/agents/rezno-orchestrator.mjs delegate "<goal>"`.
3. Copy the generated Codex prompt.
4. Review the resulting PR with CTO.
5. Merge only after explicit CTO approval.
6. After merge, record the sprint only when instructed with `record-sprint`.

Delegated sprint mode can plan, generate prompts, classify risk, and prepare review packs. It does not autonomously run Codex, merge, deploy, install packages, change schema, or change auth.

Delegated implementation prompts are allowed only when all safety gates pass:

- No goal-risk categories are detected.
- The current branch is `main`.
- The working tree is clean.
- `memory.currentApprovedMain` matches local `main`, which is the preferred clean state.

There is one safe memory fallback: if `memory.currentApprovedMain` is a valid ancestor of local `main` and every file changed since that memory SHA is limited to approved Agentic Delivery System docs/tools/memory files with no risk categories, delegated implementation may still proceed. This keeps the system usable immediately after agentic docs/tools merges. Any unknown, product/app, API, auth, schema, business logic, or high-risk drift blocks implementation.

If any gate fails, `delegate` and `operator-pack` must produce planning/review-only prompts and must not authorize implementation, commit, push, or PR creation.

## Phase 6 GitHub operator queue

Phase 6 connects the daily CTO flow to the GitHub issue-driven Codex queue while keeping the repository tooling itself safe and mostly read-only.

Primary queue:

- Use issue `#22` as the operator queue for Codex tasks.
- Prefer planning-only tasks unless the CTO explicitly authorizes docs/tools implementation or product implementation.
- Every Codex task must state the goal, authorization level, allowed actions, disallowed actions, required checks, and return format.
- Codex may open PRs only when the task explicitly says PR creation is authorized.

Routing order:

1. Direct GitHub route for safe docs/ops/tools/memory edits that ChatGPT can perform through the connector.
2. Issue Queue route through issue `#22` when Codex needs to inspect the repo or run commands.
3. Issue-body fallback when adding comments is blocked.
4. New issue fallback when issue `#22` cannot be updated.
5. Manual-copy fallback only when all connector routes fail or the required setting is outside GitHub/Codex control.

The detailed policy lives in `docs/ops/github-operator-queue.md`.

## CTO decision labels

Only these labels are supported:

- `APPROVE`
- `APPROVE AFTER SMALL FIX`
- `NEEDS QA GATE`
- `DO NOT MERGE`

Merge still requires explicit CTO approval.