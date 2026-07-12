# REZNO Marketplace Implementation Plan

Audit date: 2026-07-12

Implementation branch: `feat/rezno-marketplace-shell`

## Milestone gates

Work advances only when the current milestone validates and its data/permission boundary is documented. Milestone 2 must not begin until Milestone 1 is complete and the proposed commerce data model has been reviewed.

## Milestone 0 — Audit and design baseline

Deliverables:

- Repository, Git, dependency, native-binding, environment, Docker, Prisma, auth, permission, booking, API, mobile navigation, RTL, and test-stack audit.
- Product/domain boundary specification.
- Architecture and future data-model documents.
- Baseline validation without modifying the two pre-existing local changes.

Validation completed on the baseline checkpoint:

- `npm run lint` — passed.
- `cd apps/mobile && npm run typecheck` — passed.
- `npx --no-install prisma validate` — passed.
- `npx --no-install prisma migrate status` — passed; 20 migrations found and the local PostgreSQL schema is current.
- `docker compose ps` — PostgreSQL and Mailpit healthy; Redis running.
- `cd apps/mobile && npx --no-install expo config --type public --json` — passed.
- Isolated `next build --webpack` — passed, including TypeScript and 49 routes.
- `cd apps/mobile && npx --no-install expo export --platform ios ...` — passed; 635 modules bundled.
- `git diff --check` — passed.

The isolated default Turbopack build was not a valid repository test because the audit copy linked `node_modules` outside its filesystem root, which Turbopack explicitly rejects. Webpack was used in that isolated copy to protect the intentionally modified local `next-env.d.ts`.

There is no root or mobile `test` script and no checked-in test/spec files or runner configuration. This is a baseline coverage gap, not a passing test result.

## Milestone 1 — Mobile information architecture shell

Implementation status: code complete. The current bundle loaded successfully in the iPhone 17 Pro development client and rendered the welcome screen without a runtime error. Post-onboarding navigation interaction, VoiceOver, and narrow-screen visual QA remain manual checks.

Scope:

- Replace the visible Explore entry with Market while keeping service discovery reachable.
- Add the center REZNO AI coming-soon screen and optional public feature flag.
- Add the My Activity arc launcher and accessible fallback list/sheet.
- Route activity shortcuts to existing bookings/favorites and a truthful orders empty shell.
- Update Home service-search copy and section order.
- Carry canonical organization creation time through the existing public mobile endpoint so “New on REZNO” is deterministic and real.
- Keep existing booking/business behavior unchanged.

Acceptance checks:

- Physical RTL nav order is Home, Market, REZNO AI, My Activity, Account from right to left.
- Market does not show service businesses as products and does not fabricate commerce data.
- Home search/categories still open service discovery.
- Activity closes on backdrop press and supports screen reader/reduced-motion/narrow-screen fallback.
- No upcoming booking is rendered without real mobile booking data.
- Typecheck, scoped lint, Prisma validation, Expo config/export, and diff checks pass.
- Manual simulator QA remains required for gesture, safe-area, visual RTL, and VoiceOver behavior.

## Milestone 2 — Commerce foundation (blocked pending review)

Planned only; not implemented in Milestone 0 or 1:

- Add reviewed Prisma enums/models for stores, catalog, variants, inventory, carts, orders, addresses, payments, shipments, and inventory movements.
- Add migration and generated client.
- Add commerce-specific permission constants and seller/admin authorization helpers.
- Implement read-only published store/product APIs first.
- Implement buyer cart APIs with bounded quantities and authoritative pricing.
- Add unit/integration tests for authorization, visibility, money, pagination, and concurrency.

Gate to exit: schema migration reviewed, permission matrix enforced, public catalog and private cart tests pass, and no booking regression.

## Milestone 3 — Checkout and inventory safety

- Transactional checkout and idempotency.
- Inventory reservation/release/consume movements.
- Order snapshots and transition history.
- Payment intent abstraction with no false success state.
- Concurrency tests proving no negative inventory or duplicate order per idempotency key.

## Milestone 4 — Seller and admin operations

- Seller catalog/inventory/order tools scoped to active organization/store.
- Admin moderation and order oversight under explicit permissions.
- Audit logs for privileged mutations.
- Bulk operations only with validation, limits, and partial-failure reporting.

## Milestone 5 — Fulfillment and production hardening

- Shipment/provider integration and verified callbacks.
- Refund/cancellation policy implementation.
- Search/index performance, observability, alerts, backup/recovery checks.
- Accessibility, localization, device, and end-to-end release QA.

## Change discipline

- Do not stage or alter `apps/mobile/package.json` or `next-env.d.ts`; both predate this work and are intentionally excluded.
- Do not run migrations, seeds, dependency installation, native generation, EAS builds, or production writes without a milestone-specific request.
- No Marketplace demo data is introduced into production code.
- Every milestone report lists database impact, permissions, validation evidence, manual QA status, known limitations, and the next gated step.
