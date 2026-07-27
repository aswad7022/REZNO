# Gate 8C — Test Plan

## Focused contract

`npm run test:stage8c`

The Gate 8C contract covers scope boundaries, permission-filtered localized
navigation, RTL/LTR direction, 44×44 controls, scoped semantic colors, dense
tables, keyboard scrolling, loading/error/empty states, Stage 6 runtime truth,
visual-evidence hashes, migration count, and Migration 48–51 hashes. It then
runs the complete Gate 8B, Gate 8A, and Stage 7D regression chain.

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
11. Visual-manifest byte/hash verification.
12. Production and Mobile dependency audits.
13. Secret/privacy scan and final P0/P1/P2 review.

## Author verification record

The final authoritative runs on the Gate 8C branch completed as follows:

| Check | Result |
| --- | --- |
| Gate 8C plus inherited Gate 8B/8A/Stage 7D chain | 123 passed; 0 failed/skipped/todo/cancelled |
| Complete Unit suite | 583 passed; 0 failed/skipped/todo/cancelled |
| Complete PostgreSQL integration suite on a fresh 51-migration database | 433 passed; 0 failed/skipped/todo/cancelled |
| Complete production-server HTTP/RSC/API suite | 133 passed; 0 failed/skipped/todo/cancelled |
| Next.js production build | 115/115 static pages generated |
| Root and Mobile TypeScript; ESLint; diff check | passed |
| Prisma format, validate, and generate | passed; no schema or migration diff |
| Expo dependency compatibility and Doctor | passed; 20/20 Doctor checks |
| Expo export | iOS 1016 modules; Android 1016 modules; Web 752 modules |
| Production dependency audits | root 0; Mobile 0 vulnerabilities |
| Visual evidence | 24 byte-authenticated captures |

One earlier local HTTP rehearsal was invalidated by a host `ENOSPC` condition.
Only reproducible, complete runs after freeing generated cache space and
recreating the disposable PostgreSQL container are counted above.

## Manual interaction and visual checks

- desktop and compact navigation in `ar`, `ckb`, and `en`;
- keyboard order, focus visibility, Escape/close behavior, and active-page name;
- light/dark semantic contrast;
- dense tables, long labels, horizontal scroll, sticky headers, and pagination;
- forms, validation, dialogs/Sheets, and destructive clarity;
- loading, empty, error, permission, communications, bookings, restaurant,
  commerce, payments, platform jobs, and runtime-truth states;
- reduced motion and absence of horizontal page overflow.

## Integrity

Migration count remains `51`; no Migration 52 or Prisma schema change is
allowed. Stage 6 runtime and Stage 7 external validation remain deferred.
