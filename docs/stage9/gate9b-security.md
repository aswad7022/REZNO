# Gate 9B Security and Privacy

Status: `AUTHOR IMPLEMENTATION`

## Hard boundaries

- Production and production DB are forbidden.
- Vercel project `rezno` is forbidden.
- Gemini is forbidden on staging and production in Gate 9B.
- APNs/FCM, real payment, real storage, and app-store provider validation are
  out of scope.
- Migration 52 and Prisma schema changes are forbidden.
- Stage 7 external validation remains deferred.
- PR #100 remains out of scope.

## Secret handling

Gate 9B evidence prints names and redacted hashes only. It must never print:

- `DATABASE_URL`;
- database host or role;
- passwords;
- authorization headers;
- session cookies;
- OIDC tokens;
- provider keys;
- payment or push secrets.

## Fail-closed posture

The scripts refuse staging writes unless the target database, restore point,
runtime URL, origin, deployment SHA, provider posture, migration baseline,
schema drift, and Admin authority are proven first. `stage9b:runtime-evidence`
re-runs the centralized activation preconditions inside the mutation process
before `initializePlatformRuntime`, schedule bootstrap, manual cycles, runtime
enablement, or schedule enablement. A restore point ID by itself is never proof;
for Neon, the scripts must read provider metadata for the staging project,
branch, database, endpoint host, and snapshot. Missing provider credentials,
provider errors, stale snapshots, production-marked metadata, or mismatched
project/branch/database/host values fail closed as non-ready evidence. The
restore point ID, Neon token, and database URL are never printed in public
evidence. Without live provider verification the result is
`UNVERIFIED_RESTORE_POINT`.
Provider-dependent jobs must report `NOT_CONFIGURED` truthfully when their
provider is unavailable.
