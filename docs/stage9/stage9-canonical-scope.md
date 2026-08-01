# Stage 9 — Final Integration and Release Baseline

Status: `Gate 9C ACTIVE — RELEASE CANDIDATE HARDENING`
Base: `c20ba5720e55bdb8676c29cd901ab83916da88fb`

## Official project state

- Stages 1–8: `CLOSED`
- AI Gates A–D: `CLOSED`
- Current active gate: `Stage 9 Gate 9C — Release Candidate Hardening`
- Gates 9A and 9B: `CLOSED`
- Gate 9D: `NOT STARTED`
- Stage 6 runtime on staging: `ENABLED · 13/13 SCHEDULES · STABLE`
- Stage 6 runtime on production: `NOT ACTIVATED`
- Stage 7 physical/provider validation: `DEFERRED_BY_OWNER`
- Staging and production AI: `DISABLED`
- Protected PR #100: `OUT_OF_SCOPE`

## Stage 9 goal

Stage 9 is the final product-integration and release-readiness phase. It does
not add new business capability. Its job is to prove that the closed product,
platform, mobile, visual, and AI gates still compose safely as one system before
external validation, production activation, and final release decisions.

## Gate map

| Gate | Status | Scope |
| --- | --- | --- |
| 9A | Closed | Final integration baseline, release inventory, environment matrix, safe CI coverage, migration and performance baselines. |
| 9B | Closed | Staging-only deployment, authenticated database evidence, Stage 6 runtime activation, scheduled OIDC, stabilization hotfixes, monitoring, and rollback evidence. |
| 9C | Active | Exact-origin, deployment provenance, provider posture, build/performance/security, and stable-runtime release-candidate hardening. |
| 9D | Not started | Final release closure and deferred external validation reconciliation. |

## Gate 9C boundaries

Gate 9C may add deterministic validators, non-mutating evidence tooling,
tests, safe CI wiring, and release/rollback documentation. It may attest a
staging release candidate only when the exact `rezno-staging` main deployment
and current clean runtime evidence agree. It must not:

- start Gate 9D;
- activate Stage 6 runtime on production;
- complete or claim Stage 7 physical/provider validation;
- activate staging or production AI;
- write to production databases;
- create, rotate, print, or upload external provider secrets;
- modify PR #100;
- add Migration 52 unless an unavoidable schema requirement is proven first.

## Required source of truth

The Gate 9A baseline contracts live in `features/stage9/gate9a.ts`.
The Gate 9B staging activation contracts live in `features/stage9/gate9b.ts`.
The Gate 9C release-candidate contracts live in `features/stage9/gate9c.ts`.
The Stage 9 docs mirror those contracts and the Stage 9 test suite verifies
inventory, environment posture, runtime registry, deployment provenance,
performance/security budgets, and migration baseline remain consistent.
