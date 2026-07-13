# REZNO Marketplace Product Specification

Status: Milestone 0 baseline approved for Milestone 1 shell work

Audit date: 2026-07-12

Baseline checkpoint: `aaceb2d8aa8812fe1929ec9ab72134673ada0767` (`pre-marketplace-rezno-ui`)

## Product boundary

REZNO has two separate customer domains:

1. **Bookings and services**: discovering businesses, selecting a service, reserving a time, managing a booking, reviews, and service favorites.
2. **Commerce marketplace**: discovering stores and physical products, managing a cart, checking out, paying, tracking fulfillment, and managing seller inventory.

The word `marketplace` in the pre-existing code refers to public business and service discovery. It does **not** represent product commerce. New commerce code must use explicit commerce concepts and must not reuse `Booking`, `Service`, `BranchService`, or restaurant reservation records as products or orders.

## Milestone 1 experience

The mobile bottom navigation is presented in this physical RTL order, from right to left:

1. Home (`الرئيسية`)
2. Market (`السوق`)
3. REZNO AI, centered
4. My Activity (`نشاطي`)
5. Account (`الحساب`)

### Home

Home remains a service-booking surface and keeps this order:

- Existing premium header.
- Service/business search with the Arabic placeholder `ابحث عن خدمة أو نشاط`.
- Booking-relevant promotional banner.
- Service categories.
- Upcoming booking only when a real booking is available; no synthetic booking is created for this section.
- Recommendations based on the real business discovery response.
- New on REZNO ordered by a real `createdAt` value from the API.
- Optional nearby content after the required sections.

### Market

The Market entry is a truthful Milestone 1 shell for future product commerce. It may expose the intended search and information architecture, but it must not show invented products, stores, stock, prices, or delivery promises. Product/store data begins only after the Milestone 2 schema and APIs are approved.

The existing service discovery screen remains reachable from Home search, service categories, favorites, and other booking entry points. This preserves the service journey while separating it from the new Market tab.

### REZNO AI

REZNO AI is a clearly labeled “coming soon” capability. It must not simulate recommendations, chat responses, or automated decisions. `EXPO_PUBLIC_REZNO_AI_ENABLED` is the reserved client feature flag; Milestone 1 leaves real AI functionality disabled.

### My Activity

My Activity opens a dismissible activity launcher with these shortcuts:

- My Bookings (`حجوزاتي`)
- My Orders (`طلباتي`)
- Favorites (`المفضلة`)

The default presentation is an arc above the navigation bar. A bottom-sheet/list presentation is required for screen readers, reduced-motion users, and screens too narrow for the arc. Tapping outside closes the launcher. The central REZNO AI control must remain unobstructed.

My Orders is an honest empty shell until commerce orders exist. My Bookings and Favorites retain the existing service behavior.

## Commerce roles

- **Buyer**: an active, onboarded REZNO person. Can own carts, place orders, view only their orders, and manage their own commerce favorites.
- **Seller member**: an active `OrganizationMember` whose organization owns the store. Seller abilities must be granted by explicit commerce permissions; a membership alone is not sufficient for destructive inventory or fulfillment actions.
- **Admin**: a user with active `AdminAccess` and the required explicit admin permission. Environment super-admin remains the existing bootstrap mechanism.
- **Guest**: may browse only records that are explicitly public and published. Guest checkout is out of scope unless separately approved.

## Product visibility and truthfulness

A product is customer-visible only when all of the following are true:

- The store is active and published.
- The product is `ACTIVE` and published.
- At least one variant is active.
- A sellable price and ISO currency are present.
- Inventory policy permits sale.
- The product and store are not soft-deleted or administratively suspended.

Search and category feeds must query canonical database records. Static demo arrays are allowed only in explicit development fixtures and must never be returned by production endpoints.

## Order lifecycle

The first approved lifecycle is:

`PENDING_PAYMENT -> CONFIRMED -> PROCESSING -> READY_TO_SHIP -> SHIPPED -> DELIVERED`

Terminal or exceptional transitions include `CANCELLED` and, after payment support is implemented, refund states on the payment record. Transition authorization and audit history are mandatory. Bookings continue to use their independent booking lifecycle.

## Inventory policy

- Stock quantities are integers and cannot become negative.
- Checkout reserves stock transactionally.
- Failed or expired checkout releases its reservation.
- Confirmed sale consumes the reservation.
- Every adjustment writes an immutable inventory movement.
- Retryable writes use an idempotency key.
- Seller reads and writes are scoped to a store owned by the active organization.

## Search

- Service search continues to use the existing Arabic/Kurdish/English normalization and business/service discovery endpoint.
- Product search is a separate future index over published store, product, category, and variant data.
- Product search must support normalized Arabic text, pagination/cursors, deterministic ordering, and visibility filters.
- “New on REZNO” uses canonical creation time, not randomization or rotating fixture order.

## Explicitly out of scope before Milestone 2

- Product, variant, inventory, cart, order, payment, or shipment database tables.
- Product/store production endpoints.
- Checkout, payment authorization/capture, refunds, delivery integrations, and seller inventory screens.
- Fake products, orders, stock, payment success, AI responses, or delivery tracking.
- Replacing the existing booking engine.
