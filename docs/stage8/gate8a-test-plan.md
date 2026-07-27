# Gate 8A — Verification Plan

## Focused contracts

`npm run test:stage8a`

This must pass the Gate 8A token/state/baseline suite and the complete Gate 7D
unit regression with no failure, skip, todo, or cancellation.

## Static and generated-code checks

- `npx tsc --noEmit`
- `npm run typecheck --prefix apps/mobile`
- `npm run lint`
- `git diff --check`
- `npx prisma format --check`
- `npx prisma validate`
- `npx prisma generate`

## Product regressions

- all unit tests
- all PostgreSQL integration tests on a disposable local database
- all HTTP/RSC/API tests against the intended production server
- focused Gate 7A–7D regressions

No skipped, todo, or cancelled test is accepted as a complete pass.

## Builds and platform artifacts

- Next.js production build
- Expo dependency compatibility check
- Expo Doctor
- iOS Hermes export
- Android Hermes export
- Web export

Exports are local artifacts only. No store submission, production update, EAS
submit, or provider activation is authorized.

## Visual and accessibility checks

- Arabic RTL desktop public/auth/admin
- Arabic RTL compact marketplace
- Expo mobile compact error state
- English LTR and Kurdish RTL direction contracts
- keyboard focus and semantic control names
- disabled/loading/error/success state contracts
- web and native reduced-motion behavior

The baselines are evidence for the foundation, not approval of final product
polish. Formal cross-browser/device visual regression belongs to Gate 8D.

## Audits and integrity

- root production dependency audit: zero
- mobile dependency audit: zero
- migration count: 51
- migrations 48–51 hashes unchanged
- `prisma/schema.prisma` unchanged
- no Migration 52
- no secret or credential in the diff

## Handoff

After local verification, push the author branch and open an unmerged Draft PR.
Wait for GitHub Actions and both Vercel projects on the exact head. Do not mark
the PR Ready and do not begin Gate 8B.

## Author evidence

| Check | Final result |
| --- | --- |
| Gate 8A + Gate 7D unit regression | `107/107` pass (`9 + 89 + 9`) |
| Complete unit suites | `558/558` pass (`349 + 209`) |
| PostgreSQL integration, fresh disposable database | `433/433` pass |
| Production-server HTTP/RSC/API | `133/133` pass (`6 + 122 + 5`) |
| Root and Mobile TypeScript | PASS |
| ESLint and `git diff --check` | PASS |
| Prisma format/validate/generate | PASS; schema unchanged |
| Next.js production build | PASS; `115/115` pages |
| Expo dependency check / Doctor | current / `20/20` |
| iOS Hermes export | PASS; `1016` modules; `3.4 MB`; `32` files |
| Android Hermes export | PASS; `1016` modules; `3.4 MB`; `32` files |
| Expo Web export | PASS; `527` modules; `2.1 MB`; `34` files |
| Root production / Mobile dependency audits | `0 / 0` findings |
| Migrations | `51`; 48–51 byte-identical; no Migration 52 |

The final focused suite includes explicit WCAG AA checks for the light and dark
web/native semantic pairs and source contracts for 44×44 shared Web controls,
dashboard navigation, and the native startup retry action.

The corrected database suites used only fresh local disposable PostgreSQL
databases and the repository's non-production CI-shaped environment. All
temporary databases, fixtures, screenshot identities, and export directories
were removed after evidence capture.
