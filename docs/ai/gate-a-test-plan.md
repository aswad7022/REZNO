# AI Gate A Test Plan

Gate A is valid only when the foundation remains closed, provider-neutral, and testable.

## Focused checks

- `npm run test:ai-gate-a`
- Verify the customer assistant web surface is coming-soon only.
- Verify mobile AI remains behind the reserved flag and does not call a provider.
- Verify `ar/en/ckb` copy exists.
- Verify all AI tools are read-only.
- Verify feature disabled, kill switch, unsafe input, forbidden action, ungrounded output, and deterministic grounded cases.

## Regression checks

Run the standard repository checks before opening the Draft PR:

- Gate 8 regressions where relevant;
- all unit tests;
- PostgreSQL integration when affected;
- HTTP/RSC/API when affected;
- root and mobile TypeScript;
- ESLint and `git diff --check`;
- Prisma format/validate/generate with no schema diff;
- Next.js production build;
- Expo dependency check and Doctor;
- iOS/Android Hermes and Web exports;
- production and mobile audits;
- secrets/privacy scan.

No skipped, todo, cancelled, or knowingly failing Gate A test is acceptable.
