# Gate 9D Test Plan

Status: `AUTHOR IMPLEMENTATION`

## Focused Gate 9D checks

- `test:stage9d:unit` runs Gate 9A, Gate 9B, Gate 9C, and Gate 9D unit
  contracts.
- `test:stage9d:postgres` runs Gate 9A, Gate 9B, Gate 9C, and Gate 9D
  PostgreSQL baselines on a disposable database.
- `test:stage9d:diff-check` runs
  `git diff --check d5a01deafeb19dbc72529dc15d20bc9ef7df9377...HEAD`.
- `stage9d:final-release-evidence` verifies release evidence from a local JSON
  file with redacted output.

## Required regression coverage

Gate 9D must preserve:

- Gate 9A–9C contracts;
- Stage 6 platform jobs/operations regressions;
- Stage 7/8 regressions;
- AI Gates A–D regressions;
- full unit, PostgreSQL, HTTP/RSC/API suites;
- Root and Mobile TypeScript;
- ESLint and whitespace checks;
- Prisma format/validate/generate with no schema or migration diff;
- Next.js production build;
- Expo dependency check, Expo Doctor, and iOS/Android/Web exports;
- production/mobile audits;
- source, privacy, and client-bundle secret scans.

## Negative evidence probes

The Gate 9D evaluator and CLI must reject:

- any unknown top-level field;
- any unknown nested field;
- any extra critical-migration hash key;
- any secret-like key or value at any depth;
- self-attested source evidence;
- stale or future-dated evidence;
- GitHub/Vercel/local/authorized SHA mismatch;
- staging runtime instability;
- production runtime or AI activation inside this gate;
- production mutations or production secret changes;
- incomplete runbooks.

The secret-bearing probe uses only fake sentinel values and must prove that the
CLI output does not include the sentinel key, sentinel user, sentinel password,
or database URL text.
