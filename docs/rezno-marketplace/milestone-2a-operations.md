# REZNO Marketplace Milestone 2A Operations

## Pending Order expiration

Domain entrypoint:

`expirePendingOrdersBatch` / `expireAllEligiblePendingOrders` in `features/commerce/services/expiration-service.ts`.

Manual command:

```bash
COMMERCE_EXPIRATION_CONFIRM=EXPIRE_PENDING_COMMERCE_ORDERS \
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public' \
npm run commerce:expire-pending-orders
```

The command refuses to run without the exact confirmation token. It processes bounded batches with `FOR UPDATE SKIP LOCKED`, rechecks PENDING state and `reservationExpiresAt`, releases ACTIVE reservations exactly once, writes RELEASE StockMovements and OrderStatusHistory, marks Payment VOIDED, and sets Order EXPIRED.

No production scheduler was integrated. Before checkout release, configure Vercel Cron or a dedicated worker to invoke the guarded operation frequently enough to honor the owner-approved 15-minute hold. Protect the production entrypoint with platform authentication/secret, prevent overlapping unbounded runs, monitor failures/latency, and alert on overdue ACTIVE reservations.

## Reconciliation

Operational checks should verify:

- InventoryItem onHand/reserved remain nonnegative and reserved <= onHand.
- `reserved` equals the sum of ACTIVE InventoryReservations per InventoryItem.
- Every reservation transition has the expected deterministic StockMovement.
- Every non-PENDING terminal Order has no ACTIVE reservation.
- Every COMPLETED offline Order is PAID; rejected/cancelled/expired Orders are VOIDED.
- Order totals equal immutable OrderItem totals plus delivery fee and zero tax.

Do not repair StockMovement history. Use an audited forward adjustment with a reason and idempotency key.

## Release gates

The following are open and must not be described as complete:

- Real production scheduler for 15-minute expiration.
- Redis/shared production rate limiting; the current limiter is process-local.
- Authenticated Better Auth Expo transport verification for future private mobile APIs.
- Production ProductMedia host/storage/deletion policy.
- Physical iPhone VoiceOver QA.
- Privacy retention/anonymization policy for addresses, Orders, and idempotency records.
- Fiscal/tax confirmation; tax remains fixed at zero in Milestone 2A.
- Production database backup, restore test, and migration rehearsal.

## Deployment and rollback

1. Keep commerce routes/UI disabled.
2. Back up and restore-test the target database.
3. Run `prisma migrate status` and rehearse on a clone.
4. Apply the migration and verify OWNER-only backfill.
5. Run unit/integration/reconciliation checks against staging.
6. Configure scheduler and shared limiter before enabling checkout in a later milestone.

If validation fails before writes are enabled, disable the feature and restore the pre-migration backup or use a reviewed disposable rollback. After Order data exists, prefer a forward migration/service repair; never drop historical commerce tables as an emergency shortcut.
