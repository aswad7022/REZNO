# Gate 9C Test Plan

Status: `AUTHOR IMPLEMENTATION`

## Deterministic contracts

The Gate 9C unit suite covers:

- exact staging origin and target enforcement;
- production Next.js runtime posture;
- disabled external providers and engaged AI kill switch;
- secret-presence booleans without secret values;
- trusted GitHub/Vercel project, alias, branch, status, and SHA binding;
- malformed, mismatched, stale, and future deployment evidence;
- migration hashes/count, drift, runtime, schedules, backlog, alerts, leases,
  attempts, and invocations;
- test/type/lint/build/Prisma/source evidence;
- web route and iOS/Android/Web bundle budgets;
- zero production audit and secret-scan findings;
- CLI success/failure exit codes and redacted output;
- preview mobile origin pinned to staging and production mobile fail-closed.

## PostgreSQL contracts

The integration suite runs only against a disposable non-production database.
It reads the exact migration baseline and platform job/schedule enums inside a
read-only transaction. It performs no fixture insertion, runtime activation,
schedule change, or cleanup mutation.

## Full regression

CI must run:

- Stage 8D and AI Gate D inherited closure contracts;
- Gate 9A–9C focused unit and PostgreSQL contracts;
- full unit and PostgreSQL suites;
- production Next.js build and live HTTP/RSC/API contracts;
- Root and Mobile TypeScript, ESLint, Prisma validate/generate;
- production dependency audits and secret/client-bundle scans.

No failed, skipped, todo, or cancelled final test is accepted. Vercel checks
for both `rezno` and `rezno-staging` must be green on the exact reviewed SHA.
