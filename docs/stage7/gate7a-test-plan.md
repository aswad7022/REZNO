# Gate 7A Test Plan

Status: **AUTHOR VERIFICATION COMPLETE — PHYSICAL/STORE NOT RUN**.

## Required repository checks

1. `npm run test:stage7a` with zero failure, skip, todo, or cancellation.
2. Complete root Unit suite, including the Gate 7A config contracts.
3. Mobile TypeScript and root non-incremental TypeScript.
4. ESLint with zero warning and `git diff --check`.
5. `npm run validate:release-config --prefix apps/mobile`.
6. `expo config --type public` and EAS config resolution for Development,
   Preview, and Production without a build.
7. Expo dependency check and Expo Doctor.
8. iOS and Android Hermes exports plus Expo Web export.
9. Prisma format/validate/generate and Next.js production build regression.
10. Production dependency audit, full Mobile audit, migration count/checksums,
    secret scan, and final diff/security review.

## Gate 7A contract matrix

The focused tests must prove:

- exact EAS project, iOS bundle ID, Android package, and `rezno` scheme;
- Development/Preview internal distribution and exact EAS environments;
- Production store distribution and exact production environment;
- Development/Preview use the public staging origin;
- Production cannot embed the staging origin in tracked config;
- a non-development release accepts only
  `https://rezno-staging.vercel.app`;
- special-use, DNS-to-private, and unapproved public origins are rejected,
  including `.invalid`, `.home.arpa`, `.test`, `nip.io`, and `example.com`;
- a release rejects URL credentials, suffixes, and non-standard ports;
- unconfigured development alone may use local HTTP;
- Expo Web keeps a React-matched `react-dom` and compatible
  `react-native-web`.

## Safe read-only external checks

- GitHub `main` and PR #128 merge commit;
- PR #100 remains Open Draft and unchanged;
- EAS `whoami` and project identity only;
- Vercel alias/deployment identity and unauthenticated API status only.

No EAS build, store submission, Vercel mutation, GitHub variable mutation,
database connection, or staging data mutation is permitted.

## Physical and store evidence

| Check | Gate 7A status |
| --- | --- |
| Current Android Development build | `NOT_RUN` |
| Current Android Preview build | `NOT_RUN` |
| Current iOS Development build | `NOT_RUN` |
| Current iOS Preview build | `NOT_RUN` |
| Physical Android install/open | `NOT_RUN` |
| Physical iPhone install/open | `NOT_RUN` |
| TestFlight validation | `BLOCKED` |
| Play Store validation | `BLOCKED` |
| Production signed build | `BLOCKED` — approved production API origin absent |

Historical artifacts are context only and cannot satisfy this matrix.

## Completed author results

| Check | Result |
| --- | --- |
| Gate 7A focused | 10/10 passed; 0 skipped/todo |
| Complete Unit | 470/470 passed; 0 skipped/todo |
| Root TypeScript | Passed |
| Mobile TypeScript | Passed |
| ESLint / diff check | Passed / passed |
| Release config validator | Passed |
| Prisma validate/generate | Passed / passed |
| Next.js production build | Passed; 115/115 static-generation entries |
| Expo dependency check | Passed |
| Expo Doctor | 20/20 passed |
| iOS Hermes export | Passed; 3.1 MB |
| Android Hermes export | Passed; 3.1 MB |
| Expo Web export | Passed; 1.9 MB |
| Root production audit | 0 vulnerabilities |
| Mobile full audit | 0 vulnerabilities |
| Root full audit | 3 moderate / 9 high / 0 critical, inherited development-only baseline; root lockfile unchanged |
| Migration count | 49; no migration/schema diff |

The checks above are repository/build-time evidence only. They do not change
any `NOT_RUN` or `BLOCKED` row in the physical/store matrix.

## Acceptance

Gate 7A is author-complete only when every repository check is green, external
non-build access checks are truthful, no migration changes, no secret
exposure, no P0/P1/P2, and the final Draft PR remains unmerged. Physical/store
rows stay explicitly `NOT_RUN/BLOCKED` until a separately authorized run
produces exact evidence.
