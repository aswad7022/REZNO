# REZNO Marketplace Milestone 2A Testing

## Test foundation

The test foundation uses Node 24 `node:test` through the already-installed `tsx` package. No dependency or lockfile change was needed.

Root scripts:

- `npm run test:unit`
- `npm run test:integration`
- `npm run test:commerce`
- `npm test`

Integration tests refuse to mutate a database whose name does not contain `_test` or `test_`.

Example local setup:

```bash
docker exec rezno-postgres createdb -U rezno rezno_commerce_m2a_test
DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/rezno_commerce_m2a_test?schema=public' npx prisma migrate deploy
DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/rezno_commerce_m2a_test?schema=public' npm run test:commerce
```

Use only disposable credentials/databases. The integration suite truncates domain tables with CASCADE after verifying the database name.

## Unit coverage

Fifteen passing tests cover:

- Decimal totals and decimal-string output.
- IQD fractional rejection and compare-at validation.
- one-Store Cart policy, duplicate merge, and version conflict.
- canonical request hashing and idempotency decisions.
- Store lifecycle and Product publication visibility.
- Order/Fulfillment/Payment transitions and cancellation actors.
- deterministic movement keys and exact 15-minute expiry calculation.

## PostgreSQL integration coverage

Twenty-two passing tests/subtests cover:

- migration record and one Store/Organization.
- inventory CHECK constraints.
- non-OWNER fail-closed permission behavior.
- one ACTIVE Cart and cross-Store Cart rejection.
- customer address/Order isolation.
- pending Order, snapshot, reservation, Payment, and idempotent replay.
- Product creation rollback and atomic Default Variant/Inventory creation.
- existing admin audit events for Store review/suspension/reactivation and Product suspension.
- actual concurrent checkout against one unit of stock; one succeeds, one receives `INSUFFICIENT_STOCK`, and no oversell occurs.
- concurrent same-buyer/same-key replay and same-key/different-request conflict.
- buyer-scoped idempotency and cross-customer resource denial.
- exact-once consumption, release, restock, and expiration.
- truthful offline payment and completion.
- cross-Organization merchant denial.
- Store suspension blocking Cart mutation/Checkout while preserving Cart.
- archived Product snapshot integrity.
- existing Booking record regression.

The suite uses real PostgreSQL transactions. It does not claim concurrency safety from mocks.

## Known test-runtime warning

The integration run emits a `pg` deprecation warning about `client.query()` while a client is already executing a query. A traced run places the concurrent calls in `@prisma/client-engine-runtime`'s nested-write interpreter (`Array.map`) through `@prisma/adapter-pg`; REZNO service code contains no parallel query calls on one transaction client. Tests pass and invariants hold. Recheck this adapter behavior before `pg` 9 or a Prisma adapter change; no dependency was changed in Milestone 2A.

## Required release testing still open

- Production-like migration/backup rehearsal owned by operations.
- Scheduler invocation and expiration monitoring.
- Shared rate-limit multi-instance tests.
- Authenticated Better Auth Expo API transport tests.
- Production media-host validation.
- Privacy/fiscal review.
- Physical iPhone VoiceOver QA.
