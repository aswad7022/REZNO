# Gate 8C — Test Plan

## Focused contract

`npm run test:stage8c`

The Gate 8C contract covers scope boundaries, permission-filtered localized
navigation, RTL/LTR direction, 44×44 controls, scoped semantic colors, dense
tables, keyboard scrolling, loading/error/empty states, Stage 6 runtime truth,
production-capture evidence integrity, migration count, and Migration 48–51
hashes. It then runs the complete Gate 8B, Gate 8A, and Stage 7D regression
chain.

Every test run must finish with zero failures, skipped tests, todos, or
cancellations.

## Complete verification

1. Gates 8A–8C and prior regressions.
2. All Unit tests.
3. All PostgreSQL integration tests on a fresh disposable 51-migration database.
4. All HTTP/RSC/API tests against the intended production build.
5. Root and Mobile TypeScript.
6. Full ESLint and `git diff --check`.
7. Prisma format check, validate, and generate with no schema diff.
8. Next.js production build.
9. Expo dependency compatibility and Expo Doctor.
10. iOS/Android Hermes and Web exports.
11. Visual-manifest file, page-preflight, metric, dimension, format, and hash
    verification.
12. Production and Mobile dependency audits.
13. Secret/privacy scan and final P0/P1/P2 review.

## Author verification record

The final authoritative runs on the Gate 8C branch completed as follows:

| Check | Result |
| --- | --- |
| Gate 8C plus inherited Gate 8B/8A/Stage 7D chain | 135 passed; 0 failed/skipped/todo/cancelled |
| Complete Unit suite | 595 passed; 0 failed/skipped/todo/cancelled |
| Complete PostgreSQL integration suite on a fresh 51-migration database | 433 passed; 0 failed/skipped/todo/cancelled |
| Complete production-server HTTP/RSC/API suite | 133 passed; 0 failed/skipped/todo/cancelled |
| Next.js production build | 115/115 static pages generated |
| Root and Mobile TypeScript; ESLint; diff check | passed |
| Prisma format, validate, and generate | passed; no schema or migration diff |
| Expo dependency compatibility and Doctor | passed; 20/20 Doctor checks |
| Expo export | iOS 1016 modules; Android 1016 modules; Web 752 modules |
| Production dependency audits | root 0; Mobile 0 vulnerabilities |
| Visual evidence | 24 production-captured PNGs; format/dimension/page-state/metric/hash authenticated; individually reviewed |

One earlier local HTTP rehearsal was invalidated by a host `ENOSPC` condition.
Only reproducible, complete runs after freeing generated cache space and
recreating the disposable PostgreSQL container are counted above.

A Gate 8C evidence-fix rehearsal against PostgreSQL 16.14 reproduced an
optimizer-specific Storage plan mismatch: PostgreSQL selected the provider
index where the contract expects the organization index. The authoritative
rerun used PostgreSQL 17.10, matching CI's `postgres:17`, and passed the focused
12-payment, 2-closure, 54-platform-job, and complete 433-test sequence. No
Storage, Prisma, index, migration, or assertion change was made.

## Manual interaction and visual checks

- desktop and compact navigation in `ar`, `ckb`, and `en`;
- keyboard order, focus visibility, Escape/close behavior, and active-page name;
- light/dark semantic contrast;
- dense tables, long labels, horizontal scroll, sticky headers, and pagination;
- forms, validation, dialogs/Sheets, and destructive clarity;
- loading, empty, error, permission, communications, bookings, restaurant,
  commerce, payments, platform jobs, and runtime-truth states;
- reduced motion and absence of horizontal page overflow.

## Production baseline capture

1. Apply all 51 migrations to a disposable database whose name contains
   `test`.
2. Install the lockfile-pinned browser with
   `npx --no-install playwright-core install chromium`.
3. Build with `next build` and run the result with `next start`; a development
   server is not acceptable evidence.
4. Run `npm run visual:capture:stage8c` with the local production origin in
   `GATE8C_VISUAL_BASE_URL` and the disposable `DATABASE_URL`.
5. The capture tool creates and removes only synthetic fixtures, waits for
   fonts and declared UI landmarks, disables motion, and records zero
   unacceptable console, page, resource, or HTTP response errors.
6. A new capture is written with human review set to `PENDING`. Inspect all 24
   PNG files individually and record `PASS`, the review date, and image-specific
   notes only after that inspection. Then run `npm run visual:review:stage8c`
   with `GATE8C_VISUAL_REVIEW_CONFIRM=I_REVIEWED_EACH_GATE8C_CAPTURE` and an
   exact `GATE8C_VISUAL_REVIEW_DATE`; the separate command revalidates every
   reviewed file, and the validator rejects pending review.

The validator has explicit negative regression coverage for JPEG bytes named
`.png`, blank images, incorrect dimensions, a final state with a skeleton, a
collapsed compact layout, a development overlay, an automatically pending
human review, and route/locale/state manifest mismatches. Speculative Next.js
prefetch requests cancelled with a browser `ERR_ABORTED` result are classified
as expected cancellation; every other failed resource remains blocking.

## Integrity

Migration count remains `51`; no Migration 52 or Prisma schema change is
allowed. Stage 6 runtime and Stage 7 external validation remain deferred.
