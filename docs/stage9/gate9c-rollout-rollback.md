# Gate 9C Rollout and Rollback

Status: `AUTHOR IMPLEMENTATION`

## Candidate rollout

1. Review and merge Gate 9C only after exact-head CI and Vercel success.
2. Wait for `rezno-staging` deployment from the merge SHA and approved alias.
3. Collect fresh, read-only GitHub/Vercel/build/database/runtime evidence.
4. Run `stage9c:release-evidence`; require exit `0` and
   `READY_FOR_STAGING_RELEASE_CANDIDATE`.
5. Run customer, business, admin, and mobile-preview smoke checks without
   enabling external providers.
6. Keep production and store distribution closed pending Gate 9D.

## Rollback triggers

Rollback the staging candidate when any of these occur:

- deployment SHA, project, branch, alias, or origin mismatch;
- migration drift or a failed/rolled-back migration;
- runtime backlog, overdue jobs, alert, running invocation, or stale lease;
- CI/Vercel/build/audit/secret-scan regression;
- an unexpected provider or Gemini credential becomes configured;
- route/mobile budgets exceed their accepted limits.

## Rollback sequence

1. Disable schedules, then disable the staging runtime.
2. Confirm no running attempts/invocations and no stale leases.
3. Repoint the staging alias to the last independently accepted deployment or
   deploy the accepted prior SHA.
4. Re-run read-only migration and runtime evidence.
5. Reconcile alerts through the official service path; never raw-delete jobs
   or alerts.
6. Re-enable only after a fresh restore point and the applicable Gate 9B/9C
   guards pass.

Production database, secrets, runtime, provider configuration, and PR #100 are
outside this rollback procedure.
