# Gate 9B — Staging Runtime Activation

Status: `AUTHOR IMPLEMENTATION — EXTERNAL INPUT REQUIRED FOR REAL STAGING WRITES`
Base: `032e8fe756d5ffbc67f079a2d53cb47e2f3b782d`
Branch: `feat/stage9-staging-runtime-activation`
Version: `stage9-gate9b-staging-runtime-activation-v1`

## Purpose

Gate 9B is the first owner-approved staging activation gate after the final
integration baseline. It activates and proves the Stage 6 runtime on staging
only. It must not touch production, Gate 9C, Stage 7 external validation,
Gemini, APNs/FCM, real payment providers, app stores, or PR #100.

## Allowed target

- Vercel project: `rezno-staging`
- Origin: `https://rezno-staging.vercel.app`
- Database: the authenticated staging database only, redacted in evidence as
  `database=rezno_staging`, a host hash, a role hash, and transport facts.
- Runtime URL: `REZNO_PLATFORM_RUNTIME_URL=https://rezno-staging.vercel.app`

## Activation sequence

The activation may proceed only after `gate9b-preflight`,
`gate9b-database-evidence`, and backup/restore evidence all pass in the same
process that reaches the mutation boundary. The runtime script must not trust a
previous CLI output file as authority.

1. Verify the exact source SHA is deployed to `rezno-staging`.
2. Verify the database identity from trusted expected host/role/source values,
   not from `DATABASE_URL` alone.
3. Verify a provider-backed restore point for the same staging database. If the
   restore point cannot be verified by the provider, the required result is
   `UNVERIFIED_RESTORE_POINT`.
4. Apply migrations with `prisma migrate deploy` only to healthy `51/51`.
5. Prove schema drift is absent before any write.
6. Run the bounded Gate 9B read/write probe and cleanup.
7. Re-run the activation preconditions inside `stage9b:runtime-evidence`.
8. Initialize the Stage 6 GitHub Actions runtime control.
9. Bootstrap the 13 accepted schedules; they must start disabled.
10. Run two bounded manual cycles.
11. Enable the runtime and only the 13 accepted staging schedules.
12. Observe one scheduled OIDC runtime cycle.
13. Verify no duplicate jobs, stuck leases, or unsafe provider claims.
14. Cleanup only Gate 9B fixture data and compare fingerprints.

If any required identity, restore, or Admin authority is unavailable, the only
accepted result is `EXTERNAL_INPUT_REQUIRED` and the executable exit code must
be non-zero. `READY` is the only successful executable outcome.
