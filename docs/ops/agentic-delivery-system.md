# REZNO Agentic Delivery System MVP

This document defines the MVP operating model for using agents to help deliver REZNO safely. REZNO remains a human-governed product: agents may prepare plans, implement scoped work, run QA, and produce review reports, but release decisions stay with the CTO or an explicitly delegated human reviewer.

## Goals

- Keep sprint execution consistent across planning, implementation, QA, security review, release review, and memory updates.
- Preserve REZNO architecture, auth, permissions, database safety, and product scope.
- Make every handoff auditable and easy for the CTO to approve or reject.
- Prevent hidden automation from committing, merging, deploying, or changing high-risk systems without approval.

## Safe workflow

1. Plan
   - Confirm sprint name, branch, scope, out-of-scope items, expected files, and validation commands.
   - Identify risk categories before implementation: database, schema, migrations, auth, permissions, secrets, production deployment, payments, and package changes.
   - Stop early if the sprint requires architecture or permission expansion that was not approved.

2. Execute
   - Work only inside the approved scope.
   - Prefer small, reviewable changes.
   - Do not rewrite stable features.
   - Do not use `git add .`.
   - Do not commit, push, open PRs, merge, deploy, or run destructive commands unless the task explicitly authorizes that step.

3. QA
   - Run the approved validation commands.
   - Run browser, mobile, or staging smoke checks only when requested and safe.
   - Report pass/fail with exact blockers and no secret values.

4. Security review
   - Confirm server-side authorization, ownership scoping, safe redirects, secret handling, rate limits, and input validation where relevant.
   - Escalate any unexpected auth, permission, database, or secret exposure risk.

5. Release review
   - Confirm changed files, command results, PR checks, deployment status when applicable, and mergeability.
   - Merge only after explicit CTO approval.

6. Memory update
   - Record closed sprint, confirmed main SHA, branch state, remaining risks, and next planned sprint.
   - Memory updates are summaries only; they must not imply approval for future code changes.

## Phase 2 fast-lane workflow

The fast lane is for combining compatible safe docs/tools improvements into one small PR. It is not a bypass around CTO approval.

Use:

```sh
node tools/agents/rezno-orchestrator.mjs help
node tools/agents/rezno-orchestrator.mjs status
node tools/agents/rezno-orchestrator.mjs plan "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs handoff "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs review-local
node tools/agents/rezno-orchestrator.mjs validate
node tools/agents/rezno-orchestrator.mjs close-sprint
```

Fast-lane rules:

- Prefer docs/tools-only changes.
- Detect risk from both working tree files and committed branch diff files.
- Treat database, schema, migrations, auth, permissions, secrets, production deployment, payments, and package changes as escalation categories.
- Run only safe validation from the orchestrator.
- Never run Codex automatically from repository tooling.
- Never merge without explicit CTO approval.

## Phase 3 sprint runner and review pack

Phase 3 reduces copy/paste during supervised delivery. It can generate a sprint pack, task risk analysis, PR body draft, CTO decision report, and memory update block from task text and local Git state.

Use:

```sh
node tools/agents/rezno-orchestrator.mjs risk "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs sprint "Prepare next safe REZNO sprint"
node tools/agents/rezno-orchestrator.mjs pr-body "Agentic Delivery System Phase 3"
node tools/agents/rezno-orchestrator.mjs decision
node tools/agents/rezno-orchestrator.mjs memory "Agentic Delivery System Phase 3"
```

Phase 3 is still supervised execution:

- It does not run Codex.
- It does not edit files.
- It does not call GitHub.
- It does not commit, push, merge, deploy, or run EAS.
- It does not inspect or print secrets.
- It does not bypass CTO approval.

Speed comes from packaging safe review text, not from skipping review gates.

## Phase 4 memory ledger and next action

Phase 4 adds a safe repository-local memory ledger at `tools/agents/rezno-agent-memory.json`. The ledger records approved main SHAs, closed Agentic Delivery System sprints, blocked items, and the next recommended action.

Commands:

```sh
node tools/agents/rezno-orchestrator.mjs memory-status
node tools/agents/rezno-orchestrator.mjs record-sprint "Sprint Name" "20" "<40-character-main-sha>" "APPROVE"
node tools/agents/rezno-orchestrator.mjs next
node tools/agents/rezno-orchestrator.mjs audit
```

Safety rules:

- Default commands are read-only.
- `record-sprint` is the only write command.
- `record-sprint` may edit only `tools/agents/rezno-agent-memory.json`.
- The ledger never stores secrets.
- The system remains supervised and does not merge, deploy, or run Codex automatically.
- Merge still requires explicit CTO approval.

## CTO decision labels

Only these labels are valid:

- `APPROVE`
- `APPROVE AFTER SMALL FIX`
- `NEEDS QA GATE`
- `DO NOT MERGE`

## Forbidden actions without explicit approval

- Merge to `main`.
- Force push.
- Deploy to production.
- Run `prisma migrate reset`.
- Run `prisma db push`.
- Run destructive database commands.
- Print, store, or expose secrets.
- Commit `.env` files.
- Change Prisma schema or migrations outside an approved schema sprint.
- Change auth, permissions, payments, booking, business, or production deployment logic outside approved scope.
- Install packages or change lockfiles outside an approved dependency task.
- Run EAS builds, TestFlight, or Android internal testing without explicit approval.
- Automatically execute Codex or another agent from repository tooling.

## Escalation rules

Escalate to CTO review immediately when:

- A task touches auth, permissions, database schema, migrations, payments, secrets, or production deployment.
- A validation command fails for a reason that requires code changes outside the approved scope.
- Runtime QA finds a security, ownership, data leakage, or destructive-operation risk.
- A PR has failing or pending checks.
- A merge conflict appears.
- The requested fix requires a broader refactor than the sprint allows.

## Merge policy

Merge requires explicit CTO approval every time. A passing PR, green checks, or an agent recommendation is not merge approval.
