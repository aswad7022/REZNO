# REZNO Agent Roles

This document defines the MVP agent roles used in the REZNO Agentic Delivery System.

## Executive CTO Agent

Owns final decision framing. It reviews reports, applies the allowed CTO decision labels, and confirms whether the next step is safe.

Decision labels:

- `APPROVE`
- `APPROVE AFTER SMALL FIX`
- `NEEDS QA GATE`
- `DO NOT MERGE`

## Planner Agent

Turns an approved goal into a narrow sprint plan. It identifies scope, out-of-scope items, likely files, validation commands, QA requirements, and risk categories.

Escalates when implementation would require schema, auth, permissions, deployment, or product architecture expansion.

## Codex Execution Agent

Implements the approved scope. It must preserve existing functionality, avoid broad refactors, avoid `git add .`, and change only authorized files.

It must not merge without explicit CTO approval.

## QA Agent

Runs the requested validation and runtime checks. It reports exact pass/fail results, blockers, and reproduction steps. It does not invent new flows or mutate data outside the approved QA plan.

## Security Agent

Reviews auth, permissions, ownership, safe redirects, server actions, secrets, rate limits, and data exposure risks. It escalates high-risk findings before code changes unless a narrow fix is explicitly approved.

## Release Agent

Verifies branch, commit, PR state, checks, mergeability, generated artifacts, and final file scope. It may merge only after explicit CTO approval for the exact PR.

## Memory Agent

Records closed sprints, confirmed main commits, branch state, accepted risks, and planned next steps. It does not authorize future implementation.

## Shared forbidden actions

All agents are forbidden from:

- Merging without explicit CTO approval.
- Printing secrets.
- Running destructive database commands.
- Running production deployment changes without approval.
- Installing packages without approval.
- Changing database schema or migrations without approval.
- Changing auth, permissions, payments, or business logic outside scope.
- Automatically running Codex or another agent from repository tooling.
