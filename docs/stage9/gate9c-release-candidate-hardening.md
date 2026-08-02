# Gate 9C — Release Candidate Hardening

Status: `AUTHOR IMPLEMENTATION`
Base: `c20ba5720e55bdb8676c29cd901ab83916da88fb`

## Objective

Gate 9C turns the closed product and stable Gate 9B staging runtime into an
independently reviewable release candidate. It adds no business feature and
does not authorize a public production launch.

## Release-candidate contract

`features/stage9/gate9c.ts` accepts a staging release candidate only when all
of these agree:

- the runtime is a production Next.js build targeting explicit `staging`;
- `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, and the platform runtime URL are
  exactly `https://rezno-staging.vercel.app`;
- GitHub `main`, local HEAD, authorized SHA, and Vercel source SHA are the same
  complete commit;
- Vercel project `rezno-staging`, source ref `main`, alias, and ready status
  match;
- database evidence is fresh, migrations are healthy `51/51`, drift is
  absent, runtime is enabled, schedules are `13/13`, and all backlog, running,
  stale-lease, and alert counters are zero;
- tests, types, lint, build, Prisma, audits, secret scans, and source
  provenance pass on the deployed SHA;
- route and mobile module counts remain within the Stage 9 budgets;
- Gemini, APNs/FCM, payment, and storage providers remain fail-closed.

Evidence older than 30 minutes or future-dated fails closed. Diagnostic output
contains finding codes and safe names only; secret values, URLs with
credentials, database connection strings, provider tokens, and internal IDs
are not accepted as evidence fields or printed by the CLI.

## Honest release boundary

A successful Gate 9C result is:

`READY_FOR_STAGING_RELEASE_CANDIDATE`

Production remains:

`EXTERNAL_INPUT_REQUIRED`

because physical-device evidence, APNs/FCM provider evidence, production
payment/storage adapters, and an approved mobile production origin are not
complete. Gate 9C intentionally cannot convert those missing external facts
into a production claim.

## Tooling

- `npm run test:stage9c:unit`
- `npm run test:stage9c:postgres`
- `npm run test:stage9c:diff-check`
- `npm run test:stage9c`
- `REZNO_STAGE9_GATE9C_EVIDENCE_FILE=<redacted-json> npm run stage9c:release-evidence`

The evidence command is non-mutating. Missing, malformed, stale, unsafe, or
incomplete evidence exits non-zero.
