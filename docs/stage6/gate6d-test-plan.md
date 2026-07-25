# Gate 6D Test Plan and Author Evidence

Status: **ACTIVE** until exact-head CI/Vercel and independent review accept the
final Draft PR head.

## Required suites

1. Gate 6D unit/source contracts and PostgreSQL concurrency/lifecycle tests.
2. Complete unit, PostgreSQL integration, and built production HTTP/RSC/API
   suites with no unexplained skip.
3. Fresh 1→49 migration rehearsals, populated 48→49, second deploy no-op,
   zero failed/rolled-back migrations, constraint/index/trigger checks, and
   preservation fingerprints.
4. ESLint, non-incremental TypeScript, Prisma format/validate/generate, and
   Next.js production build.
5. Mobile TypeScript, Expo dependency check, Expo Doctor, and iOS/Android
   Hermes exports.
6. Production/full dependency audits, secret/PII/payment/provider/job-authority
   scans, migration checksums, and `git diff --check`.
7. Authenticated staging fixture twice, Gate 6D smoke, Gate 6A–6C and linked
   Stage 4/5 successors, cleanup twice, and preserved foreign/non-fixture
   fingerprints.

## Local evidence

The closure run used a fresh disposable PostgreSQL database with all 49
migrations and no failed or rolled-back row.

- Unit: 461/461, zero failures/skips.
- PostgreSQL integration: 425/425, zero failures/skips.
- Built production HTTP/RSC/API: 131/131, zero failures/skips, with all eleven
  required base URLs and a PostgreSQL-backed production server.
- Gate 6D focused unit/source contracts: 16/16.
- Gate 6D PostgreSQL: 10/10, including multi-client rate races, runtime replay
  and fencing, scheduler dedupe, alert/incident races, revocation, signed
  pagination, DTO redaction, triggers, constraints, and indexes.
- ESLint and non-incremental root TypeScript: pass.
- Prisma format, validation, and generation: pass.
- Next.js production build: pass, 115 pages.
- Mobile TypeScript and Expo dependency validation: pass.
- Expo Doctor: 20/20.
- iOS Hermes export: 912 modules, 3.1 MB bytecode.
- Android Hermes export: 910 modules, 3.1 MB bytecode.
- Root/Mobile production audit: zero; Mobile full audit: zero. The root
  full-tree audit reports one development-only denial-of-service advisory as
  nine transitive High entries and three development-only Moderate entries;
  all reachable 5.x copies were patched and the remaining legacy caller has no
  production path or compatible patched major.
- `git diff --check`, secret scans, and exact credential scans: pass.
- The Gate 5C remote staging seed now has an explicit bounded 30-second
  transaction timeout; its regression contract and the full Unit suite passed.

The first exact-head full PostgreSQL run was rejected after one Gate 4A
preference-window failure mixed the Node wall clock with PostgreSQL transaction
time. The isolated test passed, confirming a timing-dependent defect rather
than deterministic business behavior. Canonical notification production and
preference suppression now share exact PostgreSQL transaction time. The
focused producer suite passed, the affected Gate 4A PostgreSQL test passed five
consecutive runs, and a fresh full PostgreSQL run then passed 425/425.

An early HTTP attempt without required base URLs skipped tests and was rejected
as evidence. A second attempt mixed the production PostgreSQL limiter with
direct in-process tests and was also rejected. The accepted run used the
production server with PostgreSQL and the intended isolated memory backend only
for directly imported test handlers.

After the database-clock remediation, a legacy compound runner omitted React
Server conditions from the Notification command; that run and its downstream
non-reproducible alert-list mismatch were rejected. Applying the condition to
every test then replaced standard React for a Stage 2 component test and was
also rejected. The final runner isolates only the server-only test groups while
keeping RSC component tests on standard React. Focused Stage 2 and Notification
runs passed 5/5 each, isolated Gate 6D HTTP passed 10/10, and the final clean
full run passed 6/6 + 120/120 + 5/5.

## Authenticated staging evidence

Authenticated discovery used only Vercel project `rafidedu/rezno-staging`,
database `rezno_staging`, its matching owner role, and the direct non-pooler
Neon endpoint. Client-side TLS 1.3, hostname/SNI, system CA, expected host/role,
and Prisma physical-client reuse passed without credential output.

The database started healthy 48/48. Only Migration 49 applied, ending 49/49
with zero failed/rolled-back rows. Immediate and final repeated deploys were
no-ops.

- Gate 6D non-fixture baseline/final fingerprint:
  `85124c7ba96d135874ee7234bcc79575d3dcc6a0c5b56f99442a8fad8e0c6be1`.
- Gate 6D two-seed fixture fingerprint:
  `e1608e8b954cd76f93dd8962b6e6a87f35338cbf513f4ad163e10739f907adcb`.
- Empty fixture fingerprint:
  `e429f0075ce71b0d0fae30bb7ea4825183fc9425ce133ad4887eae57efe7c6c1`.
- Foreign Organization sentinel:
  `19d9...c6b` (full value retained in operator evidence).
- Foreign Person sentinel:
  `6fc...ef8c4` (full value retained in operator evidence).

Gate 6D smoke passed its final 37/37 matrix, including explicit
distributed-store availability and runtime `NOT_CONNECTED` assertions. Cleanup
removed 34 rows; the second cleanup removed zero; the final fingerprint
returned exactly to baseline. The final migration deploy was also a no-op.

One preliminary operator run changed the temporary rate-limit hashing secret
between smoke and cleanup. Its fingerprint guard rejected the run; the one
exact orphan bucket was identified from the otherwise-empty bucket table,
removed after authenticated target verification, and the entire Gate 6D cycle
was rerun with one stable cycle secret. A preliminary Gate 5C successor seed
also exposed Prisma's default five-second remote transaction timeout; the
transaction rolled back atomically, the bounded timeout fix passed locally,
and the complete successor cycle was rerun successfully.

Successor evidence was rerun after the final source changes and passed:

- Gate 6A: 59/59; cleanup 35 then zero.
- Gate 6B: 166/166; cleanup 70 then zero.
- Gate 6C: 111/111; cleanup 202 then zero.
- Stage 4D: 17-entry matrix passed, identical seed fingerprint
  `b974464bdccb272d2f0a3be4cdee1b87886a4027f1c6e92fb6bf5ec2e9551943`,
  cleanup 235 then zero, provider/runtime still not connected.
- Gate 5C: pass, identical rollback-only financial fingerprint
  `b313552ea282376da895de0f9ff0cd264fc47c79a9e00ad144dbb63f8299f6cf`,
  cleanup 133 then zero.
- Gate 5D: 105 checks, `passed_read_only`, cleanup 382 then zero, fingerprint
  `1cbd714622483213bfb4a95864f1cc9ddc6529fc43040a98cc69854f033e2594`.

No irreversible synthetic financial success or payout row was created.
Stage 3's global expiry script was deliberately not run on shared staging;
isolated PostgreSQL coverage proves its canonical expiry behavior without
putting foreign staging orders at risk.

## Acceptance

No P0/P1/P2, unexplained skip, failed command, credential residue, migration
drift, fingerprint drift, unresolved review thread, or exact-head Actions/
Vercel failure is accepted. Author evidence permits a Draft PR only. It does
not close Gate 6D or Stage 6 and does not authorize merge.
