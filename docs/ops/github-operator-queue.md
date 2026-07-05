# GitHub Operator Queue Phase 6

This document defines the REZNO issue-driven Codex operating mode after the GitHub connector and Codex environment were validated.

## Purpose

Phase 6 reduces manual copy/paste between the CTO, ChatGPT, GitHub, and Codex. The operator should express the goal in chat. The CTO reviewer then routes the task through the safest available channel.

## Confirmed baseline

- Repository: `aswad7022/REZNO`
- Operator queue issue: `#22 Agentic Operator Queue: direct operation mode`
- Codex environment: `REZNO`
- Codex can receive issue-triggered planning-only tasks.
- Codex can execute commands in `/workspace/REZNO`.
- Codex can open PRs only when explicitly authorized and repository permissions allow it.

## Routing order

Use the first route that works safely:

1. **Direct GitHub route**
   - Use when the task is docs, ops, safe tooling, config text, memory ledger, PR review, or merge review.
   - The CTO reviewer may create branches, edit approved files, open PRs, review PRs, and merge approved safe PRs.

2. **Issue Queue route**
   - Use when Codex must inspect the repo or run commands in its environment.
   - Prefer issue `#22` for operator tasks.
   - The issue comment must state the goal, allowed actions, disallowed actions, expected report format, and whether PR creation is authorized.

3. **Issue-body fallback route**
   - Use when adding a GitHub comment is blocked by the connector.
   - Update the operator queue issue body with a compact task block and ask Codex to process the latest task block.
   - Preserve prior audit notes in the issue body.

4. **New issue fallback route**
   - Use when issue `#22` comments or body updates are blocked.
   - Create a new issue with a focused task title and body.
   - Close or link the issue after the task is resolved.

5. **Manual-copy fallback route**
   - Use only when all connector write routes are blocked or the required setting is outside GitHub/Codex control.
   - Keep the copy block minimal and explain why it is required.

## Task authorization levels

### Planning-only

Allowed:

- Inspect files.
- Run safe read-only commands.
- Report findings.

Disallowed:

- File edits.
- Branch creation.
- Commits.
- Pushes.
- PRs.
- Merges.
- Package installation.
- Deployments.
- EAS.
- Schema, migration, database, auth, API, permission, payment, mobile app logic, or business logic changes.

### Docs/tools implementation

Allowed only when explicitly authorized:

- Create a scoped branch.
- Edit approved docs/ops/tools/memory files.
- Run safe validation.
- Open a PR.

Disallowed unless separately approved:

- Package changes.
- Product app changes.
- API/auth/business logic changes.
- Schema or migrations.
- Database changes.
- Production deployment.
- EAS or app-store workflows.

### Product implementation

Requires explicit CTO scope and risk gate before any implementation. If the task touches app code, API, auth, permissions, bookings, marketplace, staff, customer data, schema, migrations, deployment, mobile, or EAS, the default route is planning/review first.

## Standard Codex issue task format

```text
@codex <short task title>

Goal:
<one clear goal>

Authorization:
- Planning-only / Docs-tools implementation / Product implementation
- PR allowed: yes/no

Allowed actions:
- <specific allowed actions>

Disallowed actions:
- <specific disallowed actions>

Required checks:
- <commands or report-only checks>

Return:
- Summary
- Files changed, if any
- Commands run and results
- Risks/blockers
- PR URL, if opened
```

## Connector failure handling

When GitHub comment creation is blocked by the ChatGPT GitHub connector:

1. Do not ask the operator to copy/paste immediately.
2. Try a shorter comment once.
3. If blocked again, try updating issue `#22` body.
4. If issue body update is blocked, create a new issue.
5. Use manual copy only for external settings or when every connector route fails.

## Codex environment setup policy

Temporary Codex setup may use `npm install --ignore-scripts` when `npm ci` is blocked by a stale lockfile. This is not the target steady state.

Target steady state:

- `npm ci --ignore-scripts`
- local temporary `DATABASE_URL` only for `prisma generate`
- `npx prisma generate`

The repository should repair `package-lock.json` in a separate dependency-lock sprint so Codex can return to `npm ci`.

## Decision labels

Use one decision only:

- `APPROVE`
- `APPROVE AFTER SMALL FIX`
- `NEEDS QA GATE`
- `DO NOT MERGE`
