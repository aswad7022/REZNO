# Gate 8B — Test Plan

## Automated contracts

`npm run test:stage8b` runs the Gate 8B customer-presentation contract and the
complete Gate 8A/Stage 7D regression chain. The Gate 8B contract verifies:

- scope and Stage 7 deferral invariants;
- truthful accessible Web state roles;
- geolocation denied/unavailable/busy behavior;
- localized server-authoritative payment presentation;
- mirrored payment-detail navigation and non-success partial-payment tones;
- semantic Mobile avatar/payment roles and 44×44 targets;
- upload/payment recovery wording;
- baseline file integrity and required visual matrix;
- migration count and Migration 48–51 hashes.

Every Node test must finish with zero failures, skipped tests, todos, or
cancellations.

## Required local verification

1. Gate 8B, Gate 8A, and prior Stage 7 regressions.
2. All unit tests.
3. All PostgreSQL integration tests against a new disposable database.
4. All HTTP/RSC/API tests against the intended production server.
5. Root and Mobile TypeScript.
6. ESLint and `git diff --check`.
7. Prisma format check, validate, and generate with no schema diff.
8. Next.js production build.
9. Expo dependency check and Expo Doctor.
10. iOS Hermes, Android Hermes, and Web exports.
11. Production and Mobile dependency audits.
12. Secret/privacy scan and final scope/security review.

## Manual visual matrix

The manifest at `baselines/gate8b-baselines.json` records real captures and
SHA-256 hashes. It spans desktop and compact Web, iOS-like and Android-like
native-web viewports, light/dark themes, `ar`/`ckb` RTL, `en` LTR, reduced
motion automated evidence, and the required customer surface/state families.
The harness could not emulate the reduced-motion media preference reliably, so
the manifest records that limitation instead of claiming a visual sample.

For every capture, inspect:

- no horizontal overflow or clipped long copy;
- no low-contrast text, status, or boundary;
- clear keyboard focus and named Web controls;
- 44×44 Mobile actions and safe-area spacing;
- correct logical order and directional icons;
- stable loading geometry and no false-success state.

Simulator-like viewport evidence is visual evidence only. It is not a claim of
physical-device, APNs/FCM, receipt, camera, or provider validation; that debt
remains outside Gate 8B.

## Author verification evidence

| Verification | Final result |
| --- | --- |
| Gate 8B + Gate 8A + Stage 7D regression chain | `115/115`; zero failed, skipped, todo, or cancelled |
| Complete Unit suite (including Gate 8A/8B contracts) | `575/575`; zero failed, skipped, todo, or cancelled |
| Complete PostgreSQL integration suite | `433/433` on a fresh disposable 51-migration database |
| Production HTTP/RSC/API suite | `133/133` (`6 + 122 + 5`) against the intended built server |
| Root/Mobile TypeScript, full ESLint, diff check | PASS |
| Prisma format check, validate, generate | PASS; schema and migration diff empty |
| Next.js production build | PASS; `115/115` static-page generation steps |
| Expo dependency check / Expo Doctor | PASS / `20/20` |
| iOS / Android Hermes exports | PASS; `1016` modules and `32` files each |
| Expo Web export | PASS; `752` modules and `34` files |
| Root production / Mobile dependency audits | `0 / 0` vulnerabilities |
| Scoped secret, privacy-log, and final security review | zero findings; no accepted P0/P1/P2 |

One initial full PostgreSQL attempt exposed a transient Storage pagination
assertion. The affected Storage file then passed `18/18` in six isolated fresh
runs, and the complete suite passed `433/433` on a newly recreated database.
Infrastructure/setup attempts interrupted by a concurrent Prisma generation,
local Docker restart, or missing local push-test environment were discarded;
the table records only clean, correctly configured reruns and does not count a
skipped check as success.
