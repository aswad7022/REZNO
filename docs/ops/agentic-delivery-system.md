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
