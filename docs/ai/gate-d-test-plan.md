# AI Gate D — End-to-End Test Plan

Status: `ACTIVE — AUTHOR IMPLEMENTATION`
Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`
Migration 52: `NOT CREATED`

## Focused tests

- `npm run test:ai-gate-d`
  - Gate A foundation regression.
  - Gate B grounded customer discovery regression.
  - Gate C provider operations regression.
  - Gate D end-to-end closure and red-team contracts.

## Gate D coverage

- Direct and indirect prompt injection.
- System prompt, key, cookie, JWT, session, booking/order/payment identifiers, Unicode, zero-width, full-width, and obfuscated PII.
- Public-only provider payload and server-only citation mapping.
- Missing, unknown, duplicate, reused, or malformed citations.
- Invented prices, ratings, availability, and external URLs.
- Provider timeout, 401/403, 429, 5xx, malformed output, circuit open/HALF_OPEN, distributed store unavailable, and kill switch before/during provider work.
- Web UX single-flight/generation fencing, cancellation, retry, stale response handling, focus management, `aria-live`, RTL/LTR, and reduced motion.

## Full validation target

- AI Gates A-D focused.
- Red-team suite.
- Unit.
- PostgreSQL on disposable DB.
- HTTP/RSC/API through production server.
- Stage 8 historical regression.
- Root/Mobile TypeScript.
- ESLint and `git diff --check`.
- Prisma format/validate/generate with no schema diff.
- Next.js production build.
- Expo dependency check and Doctor.
- iOS/Android/Web exports where local platform tooling is available.
- Web visual evidence validator.
- production/mobile audits.
- secret/privacy/client-bundle scans.
- GitHub Actions and Vercel on the final SHA.
- migration count and hashes.

