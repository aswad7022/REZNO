# AI Gate B Test Plan

Required focused command:

```bash
npm run test:ai-gate-b
```

Additional closure checks:

- all Unit tests;
- PostgreSQL integration on disposable database when database code is affected;
- HTTP/RSC/API using the production server;
- root and Mobile TypeScript;
- ESLint and `git diff --check`;
- Prisma format/validate/generate with no schema diff;
- Next.js production build;
- Expo dependency check and Expo Doctor;
- iOS, Android Hermes, and Web exports;
- production and mobile audits;
- secret, privacy, provider, and client-bundle scans.

No failures, skipped, todo, or cancelled Gate B tests are acceptable for handoff.

