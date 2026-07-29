# Gate 9A — Final Integration Baseline

Status: `ACTIVE — AUTHOR IMPLEMENTATION`
Base: `71e022d6144ac5f508dfabd7432cbf963d5d1693`
Branch: `feat/stage9-final-integration-baseline`
Version: `stage9-gate9a-final-integration-baseline-v1`

## Purpose

Gate 9A establishes the first whole-product baseline after Stages 1–8 and AI
Gates A–D have closed. It is intentionally conservative: every check must run
locally or in CI with disposable resources, deterministic fixtures, and no
external runtime activation.

## Baseline journey

The PostgreSQL baseline uses a fixed `rezno-gate9a-final-integration-baseline`
fixture and verifies these joins in one scoped run:

1. Customer, owner, and admin identities are active and onboarded.
2. Owner role and membership carry the expected commerce permissions.
3. Business, branch, service, hours, table, and menu data are publishable.
4. Public Marketplace search can see the business.
5. Public Commerce catalog can see the store and product.
6. Customer booking and restaurant reservation share the same authorized
   customer, branch, and organization.
7. Cart, checkout idempotency, order, order item, inventory reservation, and
   stock movement are internally consistent.
8. PaymentIntent, PaymentAttempt, and compatibility Payment use the
   `DETERMINISTIC_TEST` provider only.
9. Notification, recipient state, conversation, message, and read state are
   scoped to the same customer and booking.
10. UploadSession, StoredAsset, MediaContainer, and MediaBinding prove an
    approved deterministic media binding without contacting storage.
11. AdminAccess can read platform operations surfaces without granting write or
    runtime authority.
12. A PlatformJob can exist in `AVAILABLE` state while Stage 6 runtime remains
    disabled.
13. AI customer discovery remains disabled for staging/production activation
    and returns before Marketplace search or provider work.
14. Cleanup is scoped, rerunnable, and leaves no Gate 9A fixture rows.

## Determinism and safety

- IDs, timestamps, slugs, hashes, and user markers are fixed.
- Fixture emails use `rezno.invalid`.
- Phone snapshots use `REZNO-GATE9A-NOT-A-PHONE` instead of realistic phone
  numbers.
- Cleanup uses explicit fixture identifiers and reverse dependency order.
- The test refuses `NODE_ENV=production` and refuses non-test database names.
- No Gemini, APNs, FCM, payment, storage, or platform-runtime network call is
  required.

## Out-of-scope items

Gate 9A records, but does not resolve:

- Stage 6 runtime activation.
- Stage 7 physical device, store, APNs/FCM, and external provider validation.
- Production Gemini activation.
- Any PR #100 work.
- Gate 9B/9C/9D planning or execution.
