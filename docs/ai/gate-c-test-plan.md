# AI Gate C — Test Plan

## Focused

- `npm run test:ai-gate-c`
- direct privacy probes for obfuscated emails and phone/JWT/secrets
- circuit generation and half-open probes
- provider header-only key transport
- public response model/provider redaction

## Full local closure

- AI Gates A-C focused tests
- all unit tests
- PostgreSQL integration on a disposable database when distributed stores are touched
- HTTP/RSC/API through a production server
- root and mobile TypeScript
- ESLint and `git diff --check`
- Prisma format/validate/generate with no schema diff
- Next.js production build
- Expo dependency check and Doctor
- iOS, Android Hermes, and Web exports
- production and mobile audits
- secret/privacy/client-bundle scans
- migration count remains `51`, with no Migration 52
- Stage 8 historical closure regression

No skipped, todo, cancelled, or hidden failures may be counted as passing.
