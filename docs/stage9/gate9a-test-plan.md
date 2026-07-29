# Gate 9A Test Plan

Status: `ACTIVE — AUTHOR IMPLEMENTATION`

## Focused commands

| Area | Command |
| --- | --- |
| Gate 9A unit contracts | `npm run test:stage9a:unit` |
| Gate 9A PostgreSQL baseline | `npm run test:stage9a:postgres` |
| Gate 9A full focused suite | `npm run test:stage9a` |

## Required inherited checks

Gate 9A should be verified with:

- `npm run test:stage8d`
- `npm run test:ai-gate-d`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:http` against a production server
- `npx prisma format --check`
- `npx prisma validate`
- `npx prisma generate`
- `npm run lint`
- `npx tsc --noEmit --incremental false`
- `npm run build`
- `npm run typecheck --prefix apps/mobile`
- Expo dependency check and Expo Doctor
- iOS, Android, and Web exports
- production/mobile audits
- secret, privacy, and client-bundle scans
- `git diff --check`

No Gate 9A suite may use skipped, todo, cancelled, or best-effort results as
closure evidence.

## PostgreSQL setup

Use a disposable local or CI database whose name matches `_test`, `test_`, or
`gate9a`. Apply all 51 migrations before running the PostgreSQL baseline. Never
run the fixture against staging or production.

## HTTP setup

HTTP/RSC/API validation must use a Next.js production build/server, not a
development server. The Gate 9A PR does not add new HTTP routes, so the current
full HTTP suite remains the authoritative live contract.

## CI coverage

`.github/workflows/marketplace-pr-ci.yml` now runs on:

- pull requests to `main`;
- manual `workflow_dispatch`;
- pushes to `main`.

The workflow runs the Stage 9 unit baseline in static validation and the Stage 9
PostgreSQL baseline in the disposable PostgreSQL job. It does not request
Gemini, push, payment, storage, or Stage 6 runtime secrets.
