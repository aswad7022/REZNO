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

## Fast-lane delegation

The CTO may authorize a fast-lane docs/tools sprint when all compatible changes are safe to combine. Fast-lane delegation permits faster preparation and review, but it does not permit:

- Merge without explicit CTO approval.
- Package installation.
- Schema or migration changes.
- Auth, API, permission, payment, business logic, production deployment, EAS, Flutter, or mobile app logic changes.
- Automatic Codex execution from repository tooling.

The orchestrator may print plans, handoff prompts, status reports, local reviews, safe validation output, and close-sprint checklists. It must not edit files or start agents automatically.

Phase 3 delegation also allows the orchestrator to print task risk analysis, a full sprint runner pack, a PR body draft, a compact CTO decision report, and a memory update block. These outputs are advisory text only. They do not authorize implementation, deployment, or merge by themselves.

Phase 4 delegation allows the repository-local memory ledger to track closed sprints and the next recommended action. Default memory commands are read-only. `record-sprint` is the only write command, and it may update only `tools/agents/rezno-agent-memory.json` after validating the PR number, main SHA, and CTO decision label.

Phase 5 delegation allows the orchestrator to generate delegated sprint prompts and operator packs. Implementation-capable prompts require clean `main`, a clean working tree, accepted memory freshness, and no detected goal-risk categories. Exact memory/main match is preferred. Safe approved-files-only ancestor drift is allowed only when all changes since the memory SHA are Agentic Delivery System docs/tools/memory files with no risk categories. Unknown or product/app/API/auth/schema/business logic drift blocks implementation. API, business/product-domain, booking, reservation, marketplace, tenant, customer data, staff, pricing, service catalog, notification, message, review, admin, auth, schema, migration, package, deployment, payment, secret, permission, mobile, or EAS risk must produce planning/review-only prompts until CTO explicitly approves implementation. Merge always remains human-only.

Phase 6 delegation allows the CTO reviewer to operate the GitHub issue-driven Codex queue through the safest available connector route. The preferred queue is issue `#22`. If adding comments is blocked, the reviewer should try issue-body updates, then a new issue, and use manual copy only when all connector write routes fail or the required setting is outside GitHub/Codex control. Codex may inspect and report by default. Codex may edit files, create branches, push, or open PRs only when the task explicitly authorizes that action and the risk gate allows it.

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