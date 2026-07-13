# Milestone 2E mobile Commerce Marketplace

## Scope and boundaries

Milestone 2E replaces the mobile Market placeholder with a real customer Commerce
experience backed exclusively by the approved 2B–2D APIs. It does not change Prisma,
migrations, Booking, service discovery, merchant/admin capabilities, or payment
architecture. Home search continues to call `/api/mobile/marketplace` for bookable
businesses; Commerce search exists only inside the Market tab.

No fake Store, Product, price, Order, Favorite, stock, rating, discount, delivery
estimate, or Checkout success is rendered. Empty databases produce explicit empty
states.

## Mobile screen and route map

The existing `App.tsx` state navigation remains authoritative. No navigation package
was added.

```text
Bottom Market tab
  Market home
    Store detail -> Store products -> Product detail
    Product detail -> Cart -> Checkout -> Receipt -> Order detail
    Cart -> Continue shopping
    Checkout -> Address list/form

My Activity
  My Orders -> Order detail -> eligible customer cancellation
  My Favorites -> Favorite Stores / Favorite Products
  My Bookings -> unchanged Booking flow
```

Every pushed Commerce route is represented by a typed internal route. A history stack,
visible back controls, and Android hardware-back handling provide deterministic
navigation without persisting Cart or Checkout bodies on the device. The bottom
navigation retains the approved physical RTL order: Home, Market, REZNO AI, My
Activity, Account.

## API integration map

`apps/mobile/src/api/commerce.ts` is the single typed Commerce client facade. It uses
the shared mobile request primitive, central API base URL, Better Auth Expo cookie,
`expo-origin: rezno://`, JSON envelopes, safe errors, `Retry-After`, and caller-owned
AbortSignals.

| Mobile area | Approved API |
| --- | --- |
| Categories | `GET /api/commerce/public/categories` |
| Store discovery/detail | public Store collection and Store detail routes |
| Product discovery/detail | public Product and Store-scoped Product routes |
| Addresses | authenticated Address CRUD/default routes |
| Cart | authenticated Cart read/items/clear/replace routes |
| Checkout | authenticated Checkout route with UUID idempotency header |
| Orders | authenticated customer Order list/detail/cancel routes |
| Favorites | authenticated Store and Product Favorite routes |

The client never supplies a customer ID, bearer token, API key, exact inventory value,
or authoritative money calculation. Decimal values remain strings.

## Search and pagination

Commerce Store and Product search are server-side and separate from Home service
search. A 400 ms debounce and monotonically increasing request sequence prevent stale
responses from replacing newer filters. Category, in-stock, Store sort, and Product
sort values match the backend allowlists. Opaque cursors remain internal and each
collection exposes a restrained Load More state.

## Server-authoritative Cart

The UI reads and mutates the active server Cart. Quantity mutations send the current
Cart version. `CART_VERSION_CONFLICT` causes a safe refetch instead of blind replay.
Unavailable lines disable Checkout. Prices shown in Cart are current server DTO values;
the subtotal is explicitly informational.

Adding a Variant from another Store never clears the Cart silently. The customer sees
a confirmation dialog identifying the current and incoming Stores. Confirmed
replacement uses the atomic `/cart/replace` route with the Cart ID and version; it is
not emulated with clear-plus-add calls.

## Checkout and fulfillment

Checkout refetches Cart, Addresses, and Store fulfillment capabilities. It supports
only Store delivery and customer pickup. Delivery requires a selected owned Address;
pickup sends no Address. The UI describes only cash on delivery or pay at pickup and
does not expose cards, wallets, installments, refunds, or online payment.

One UUID idempotency key is held for one canonical semantic request. Whitespace-only
instruction differences normalize to the same request and reuse the key. Cart version,
fulfillment, selected delivery Address, or normalized instructions rotate the key.
The submit control is disabled in flight. Success is displayed only from the real
server receipt, which becomes the source for Order, Store, item, status, address, and
total presentation.

## Addresses and privacy

Authenticated customers can list, create, edit, delete, select, and set a default
Address. Fields and bounds mirror the approved server schema. Coordinates are omitted
because no truthful map/geocoding input exists. Address bodies, session cookies,
Checkout bodies, customer instructions, and idempotency keys are never logged or
stored in insecure local persistence.

## Orders and cancellation

My Activity → My Orders now loads real cursor-paginated Commerce Orders. Order detail
uses immutable Store, Product, Variant, media, price, delivery, pickup, and history
snapshots. It does not query current Catalog records or expose actor IDs, reservation
IDs, movement keys, or merchant/admin reasons.

Cancellation is rendered only when the server-derived flag permits it and the Payment
is not paid. A bounded reason and explicit confirmation are required. The route sends
no cancellation idempotency header. A concurrent transition produces the approved
`ORDER_NOT_CANCELLABLE` conflict and the UI does not claim refund support.

## Favorites and Notifications

Store Favorites and Product Favorites remain separate collections and models, with
real pagination and reversible optimistic card actions. Hidden resources disappear
without exposing moderation reasons. Existing service Favorite models and Booking
behavior are not merged or modified.

No second Notification inbox or mark-read state was created. Commerce events continue
to render through the existing global Notification architecture using their localized
title/body and safe metadata. A mobile Notification inbox/deep-link entry is not
invented in this milestone; Order detail navigation is available from the Commerce
receipt, Orders, and Favorites flows. Physical authenticated notification deep-link QA
remains a release follow-up when the existing global inbox is exposed in mobile.

## Loading, errors, authentication, and offline behavior

Every Commerce entry has restrained loading, empty, no-result, unavailable, generic
error, rate-limit, authentication-required, and retry states. Authenticated operations
use the existing Better Auth Expo session cookie. A `401` sends the customer toward the
existing Account surface without deleting server-authoritative state. Failed network
requests never fabricate success or clear local Cart presentation deceptively.

## Accessibility and responsive strategy

Controls expose roles, labels, selected/disabled state, adequate 42–50 point targets,
and text alternatives. RTL reverses composition rows while text uses explicit writing
direction. Statuses are communicated with localized text, not color alone. Existing
PremiumPressable and PremiumEntrance components inherit Reduced Motion handling.
Layouts use wrapping chips, flexible text, bounded images, and the existing parent
safe-area/bottom-navigation spacing for compact widths.

Physical iPhone VoiceOver QA is still a Production gate and is not claimed here.

## Validation and QA plan

Automated coverage uses the existing Node test runner without adding a mobile testing
dependency. Pure mobile Commerce tests cover money strings, search sequencing,
optimistic Favorite rollback, Checkout key reuse/rotation and canonicalization, and
customer cancellation visibility. TypeScript, lint, Expo public configuration, iOS and
Android exports, Commerce backend regression, isolated Next Webpack build, and
simulator smoke are the remaining gates recorded in the final implementation report.

## Known limitations and exclusions

- Physical-device authentication and VoiceOver remain Production gates.
- The process-local backend rate limiter remains a separate Production scaling gate.
- No mobile UI test framework exists without modifying the protected package manifest;
  pure state is covered by the established repository test runner instead.
- Mobile notification inbox/deep-link entry awaits integration of the existing global
  Notification surface; no duplicate inbox was added.
- Android emulator runtime QA depends on an available configured emulator; Android
  export is used when runtime infrastructure is unavailable.
- Merchant/admin UI, online payment, refunds, Push, Email, SMS, AI recommendations,
  driver features, and live tracking are explicitly excluded.
