# CTO Delegation Policy

This policy describes what REZNO agents may do on behalf of the CTO and what must remain human-approved.

## Delegation principle

Agents may assist with scoped delivery work, but they do not own product authority. The CTO or a delegated human reviewer controls scope approval, security acceptance, release timing, and merges.

## Allowed delegated work

When explicitly requested, agents may:

- Inspect repository state.
- Create a scoped branch.
- Create or edit approved files.
- Run validation commands.
- Run non-destructive QA.
- Prepare reports.
- Commit, push, and open a PR when authorized.
- Draft handoff prompts for the next task.

## Human-only approvals

The CTO or delegated human reviewer must approve:

- Starting a sprint.
- Expanding scope.
- Schema or migration changes.
- Auth or permission changes.
- Secret handling changes.
- Production deployment changes.
- Package installation or dependency changes.
- EAS builds or app-store workflows.
- Merge to `main`.

## Decision labels

Only these labels are used:

- `APPROVE`
- `APPROVE AFTER SMALL FIX`
- `NEEDS QA GATE`
- `DO NOT MERGE`

## Merge rule

No agent may merge without explicit CTO approval for that exact PR. Auto-merge is not allowed in the MVP workflow.

## Secret handling

Agents must never print, store, or copy secrets into chat or files. Secret values must be entered by the owner directly into provider UIs or secure terminal prompts when required.

## Escalation examples

Escalate instead of proceeding when:

- A task unexpectedly touches Prisma schema or migrations.
- A route exposes private customer, business, staff, booking, notification, message, review, or admin data.
- A package change is required but was not approved.
- A Vercel, database, Expo, EAS, or GitHub permission issue appears.
- A validation command fails and the fix is not obviously inside scope.
