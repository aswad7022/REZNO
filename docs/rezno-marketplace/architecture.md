# REZNO Marketplace Architecture

Status: Milestone 0 repository audit

Audit date: 2026-07-12

## Repository topology

- The repository root is a Next.js 16 App Router application.
- `apps/mobile` is an Expo 57 / React Native 0.86 application with its own `package.json`, lockfile, TypeScript config, and installed dependencies.
- The root package does not declare npm workspaces. Shared behavior currently crosses the mobile/server boundary through HTTP contracts, not shared workspace packages.
- PostgreSQL is accessed through Prisma 7. Docker Compose provisions PostgreSQL 17, Redis 7, and Mailpit for local development.
- Authentication uses Better Auth with a Prisma adapter. Mobile auth support is present, but the current mobile marketplace feed is public and read-only.

## Existing domain map

| Domain | Current source of truth | Important boundary |
| --- | --- | --- |
| Identity | `User` (auth) + `Person` (product identity) | A person is not permanently typed as customer or seller. |
| Business tenancy | `Organization`, `OrganizationMember`, `Role`, active-business cookie | Every business operation is scoped to a validated membership. |
| Services | `Service`, `BranchService`, `Category`, `Branch` | A service offering is not a product SKU. |
| Bookings | `Booking`, history/change requests, availability and blocked time | Mature transactional lifecycle; remains independent from orders. |
| Restaurant reservations | Booking plus reservation details/items | Remains a reservation domain, not commerce checkout. |
| Service discovery | `features/marketplace`, web `/marketplace`, mobile `GET /api/mobile/marketplace` | “Marketplace” here means public businesses/services. |
| Favorites | `CustomerFavoriteBusiness`, `CustomerFavoriteService` | Commerce favorites require a separate future product relation. |
| Administration | `AdminAccess`, permission strings, `AdminAuditLog` | Commerce permissions are not present yet. |
| Messaging/notifications | `Conversation`, `Message`, `Notification` | Can later carry order events without making messages the order source of truth. |

## Current authorization model

Server code obtains a Better Auth session, provisions/loads `Person`, rejects inactive or deleted people, and requires onboarding for customer actions. Business access is resolved through active organization memberships and a server-validated active-business cookie. Booking customer queries include `customerId`; business queries include the active `organizationId`.

Admin access is independent of organization membership. It is granted by `AdminAccess` plus explicit permission strings, with `REZNO_ADMIN_EMAILS` retained as the super-admin bootstrap. The current admin permission set has no product, store, order, or inventory capabilities, so Milestone 2 must add them deliberately.

## Mobile architecture baseline

- `App.tsx` currently owns local navigation and screen state; there is no navigation framework or global query/cache library.
- `BottomTabBar` and mobile chrome live in `src/components/mobile-chrome.tsx`.
- Service discovery is fetched with a small typed API client from `GET /api/mobile/marketplace`.
- RTL uses locale-driven physical ordering plus explicit text direction. Premium motion already observes the operating-system reduced-motion preference.
- The app currently uses React Native core `SafeAreaView`, which emits a deprecation warning in React Native 0.86. Milestone 1 follows the existing primitive because `react-native-safe-area-context` is not installed; migration should be handled as a dedicated dependency change.
- The existing booking-management UI contains development-only visual fixtures and is not a mobile booking API client. Milestone 1 must not present those fixtures as a Home “upcoming booking”.

Milestone 1 therefore stays within the current local-state architecture. Introducing a navigation or cache framework solely for the shell would create migration risk without solving a Milestone 1 requirement.

## Milestone 1 route boundary

The visible mobile Market tab becomes the commerce shell. Existing service entry points navigate to a hidden service-discovery route that renders the current nearby/business discovery screen. Existing internal booking/favorites screens remain available through My Activity.

This is an in-app route-state distinction. There is no established mobile deep-link route map to migrate. The web `/marketplace` route remains unchanged for backward compatibility and continues to mean service/business discovery until a separately named web commerce route is designed.

## Future commerce modules

Milestone 2 should add cohesive modules rather than expanding the existing service marketplace module:

- `features/commerce/catalog`
- `features/commerce/stores`
- `features/commerce/inventory`
- `features/commerce/cart`
- `features/commerce/orders`
- `features/commerce/payments`
- `features/commerce/fulfillment`
- mobile API contracts under an explicit commerce namespace

Exact directory names may follow repository conventions at implementation time, but API and model names must remain unambiguous. Existing service endpoint compatibility is required.

## Future API rules

- Public catalog endpoints return only active/published stores, products, and variants.
- Buyer cart/order endpoints require an active onboarded identity and always scope reads by `personId`.
- Seller endpoints require an active business membership and a store belonging to that organization.
- Admin endpoints require explicit commerce admin permissions.
- Mutations use Zod validation, rate limiting where externally triggerable, idempotency keys for retryable checkout/payment/inventory operations, and audit records for privileged state changes.
- Pagination is cursor-based for mutable feeds. Limits are bounded server-side.
- Order lines snapshot product name, variant name/SKU, unit price, currency, tax/discount amounts, and quantity.
- Prices use database decimals and a three-letter currency code; clients do not author authoritative totals.

## Transaction and concurrency boundary

Checkout is one server-owned transaction boundary:

1. Validate the active cart and shipping input.
2. Lock or conditionally update inventory rows.
3. Recalculate authoritative totals.
4. Create order/address/item snapshots.
5. Reserve inventory and append inventory movements.
6. Persist an idempotency record/key.
7. Commit before external payment side effects, or use an explicit payment-intent/outbox pattern.

Inventory updates must use conditional writes or serializable transactions so concurrent checkouts cannot oversell. Payment/provider callbacks must be verified and idempotent. External delivery/payment state must never be inferred from client UI state.

## Caching and performance

- Public catalog reads may use short-lived HTTP caching with explicit invalidation/revalidation on publish, price, or stock changes.
- Buyer carts and orders are private and use `no-store` semantics.
- Mobile can adopt a query/cache library when real commerce APIs arrive; cache keys must include identity and filters.
- Product lists select only card fields, paginate, and avoid per-row queries.
- Images are references to managed media; image processing and upload authorization are separate concerns.

## Environment and platform audit

Required example variables are `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `REZNO_ADMIN_EMAILS`, and `EXPO_PUBLIC_REZNO_API_BASE_URL`. Milestone 1 additionally reserves optional `EXPO_PUBLIC_REZNO_AI_ENABLED`; false/absent means coming-soon only.

No active source/config path is tied to Windows. Windows packages in lockfiles are normal optional cross-platform dependencies. `project-tree.txt` is a tracked historical Windows directory listing and should not be used as architecture input. Windows command examples in mobile docs are accompanied by non-Windows equivalents.

## Dependency/install audit

On the audited Apple Silicon host, npm install scripts are enabled (`ignore-scripts=false`). Next SWC, Sharp, and Prisma native packages are present; the SWC and Sharp binaries are arm64 Mach-O and load successfully. No blocked install script was found. Root postinstall runs `prisma generate`; mobile has no install-script package in its lockfile.
