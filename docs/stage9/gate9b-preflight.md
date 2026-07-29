# Gate 9B Preflight

Status: `AUTHOR IMPLEMENTATION`

## Required read-only proof before staging writes

Gate 9B preflight must prove all of the following without printing values:

- `origin/main` is `032e8fe756d5ffbc67f079a2d53cb47e2f3b782d`.
- Vercel deployment target is project `rezno-staging`, not `rezno`.
- The active staging origin is `https://rezno-staging.vercel.app`.
- The staging origin binding is read from Vercel's deployment aliases API,
  because the deployment-details response does not include manually assigned
  aliases consistently.
- `REZNO_PLATFORM_RUNTIME_URL` points to the same staging origin.
- Database URL parses as PostgreSQL database `rezno_staging`.
- The staging database is a direct non-pooler Neon endpoint with
  `sslmode=verify-full`.
- Authenticated expected host and role confirmations match the database URL.
- A restore point is verified from provider metadata before writes. For Neon,
  this means the snapshot is fetched from Neon API metadata for the approved
  staging project and branch, not trusted from environment values.
- Gemini, APNs/FCM, real storage, and real payment providers remain disabled.

## Current local author preflight

The author environment has no local Vercel/Neon auth config, no `DATABASE_URL`,
and no staging Admin context. Therefore the staging write phase is blocked
safely as:

`EXTERNAL_INPUT_REQUIRED`

Missing names only:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST`
- `REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE`
- `REZNO_STAGE9_GATE9B_RESTORE_POINT_ID`
- `REZNO_STAGE9_GATE9B_NEON_PROJECT_ID`
- `REZNO_STAGE9_GATE9B_NEON_BRANCH_ID`
- Neon API authentication available to the operator environment
- `REZNO_PLATFORM_RUNTIME_URL`
- staging Admin login or scoped Gate 9B Admin context

The Admin identity used for runtime and schedule activation must have the
effective dependency-complete permission set for the accepted schedules:
`PLATFORM_JOBS_VIEW`, `PLATFORM_JOBS_MANAGE`, `PLATFORM_OPERATIONS_VIEW`,
`PLATFORM_OPERATIONS_MANAGE`, `STORAGE_RECORDS_VIEW`,
`STORAGE_RECORDS_MANAGE`, `NOTIFICATIONS_VIEW`, `NOTIFICATIONS_SEND`,
`COMMUNICATIONS_DISPATCH`, `PAYMENTS_VIEW`, `PAYMENTS_RECONCILE`,
`PAYMENTS_REFUND`, `SETTLEMENTS_VIEW`, `SETTLEMENTS_MANAGE`,
`COMMERCE_ORDERS_VIEW`, and `COMMERCE_ORDERS_MANAGE`.
