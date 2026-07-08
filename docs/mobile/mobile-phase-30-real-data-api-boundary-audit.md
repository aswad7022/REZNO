# Mobile Phase 30 - Real Data Integration Planning / API Boundary Audit

## Status

**PLANNING COMPLETE / NO RUNTIME INTEGRATION IMPLEMENTED**

This phase audits the current REZNO mobile data boundaries and plans a safe path toward real-data integration. It does not connect real data, change app behavior, add API calls, modify backend routes, alter auth, change booking/payment logic, or touch the database/schema.

Next phases can use this plan to implement real-data integration in small, gated, read-only-first increments.

## Current mobile data state

| Screen / Area | Current data source | Current behavior | Safe for read-only integration? | Mutations involved? | Notes / Risks |
| --- | --- | --- | --- | --- | --- |
| Home | Static/demo arrays in `apps/mobile/App.tsx` (`featuredBusinesses`, `categories`, promo copy) | Shows premium home, search entry, category grid, nearby cards, promo | Yes, for nearby business cards and category-backed discovery | No | Category grid is visual/static. Nearby cards can be replaced after a stable read-only business discovery contract is confirmed. |
| Category grid | Static/local visual categories in `apps/mobile/App.tsx` | 4x2 visual category grid with local icon assets/fallback marks | Partially | No | Visual categories should map to backend category slugs/verticals before filtering is wired. Current labels do not guarantee backend category parity. |
| Nearby business cards | Static/demo `featuredBusinesses` | Opens local Salon Detail visual screen | Yes | No | Good first candidate if backed by `/api/mobile/marketplace` and adapter mapping. |
| Search Map | Static map canvas and static `featuredBusinesses`; also displays API status from marketplace fetch | Visual map/result sheet; API-backed status card can show loading/error/empty result state | Yes, for result list; map remains visual until location work is approved | No | Existing map is not real geolocation/map SDK. Do not add real map/location in first integration. |
| Salon Detail | Static selected `PremiumBusiness` plus static `services` | Visual business profile, services, actions, booking CTA | Yes, for business detail/service list if a mobile detail contract exists | No | Web service `getPublicBusiness` exists, but no mobile JSON detail endpoint was found. Needs adapter/contract. |
| Staff Selection | Static `bookingStaffOptions` and local `selectedStaff` state | Visual staff picker only | Later | Local state only | Backend has public professional/team data in web service, but no mobile staff endpoint. Tie to service/branch availability carefully. |
| Date/Time | Static `bookingDateOptions` and `bookingTimeOptions`; local selected date/time | Visual slot selection only | Later | Local state only | Backend slot service exists (`generateBookingSlots` / `getBookingSlotResult`) but no mobile JSON endpoint. Availability conflicts are high-risk if guessed. |
| Payment | Static `paymentMethodOptions` | Visual payment method selection only | No for first phase | Local state only | No real payment SDK or payment intent flow should be started in read-only integration. |
| Confirmation | Local visual state assembled from selected service/staff/date/time/payment | Shows visual confirmation and "View booking" path | No for first phase | Local state only | This is not a real booking. Do not connect before booking mutation/payment gates. |
| Favorites | Static placeholder plus demo suggestions | Visual-only favorites boundary | Later, after auth boundary is clear | Future read/write | Web favorites services/actions exist, but no mobile JSON favorites contract was found. Requires auth/session gate. |
| Account | Static/account boundary UI plus API base URL display | Visual auth/account/settings placeholders | Later | No runtime mutation now | Mobile Better Auth client exists, but account screen is not wired to real profile/session UI. Do not add auth behavior in first data phase. |
| Quick Booking | Static visual entry screen plus search panel | Visual-only quick booking boundary | Later | No runtime mutation now | Should remain visual until business/service/staff/availability contracts are stable. |
| My Bookings | Local `confirmedVisualBooking`, `demoManagedBookings`, local cancelled ids | Visual booking list/detail/edit/cancel panels | Later, after auth booking list API exists | Local-only visual mutation | Web booking services exist, but no mobile booking list/detail JSON endpoint was found. |
| Booking Detail | Local `VisualBooking` object | Visual receipt/details/actions only | Later | Local-only visual edit/cancel panel | Should map to a real booking detail adapter only after auth and booking ownership checks are defined. |
| Edit/cancel panels | Local visual panel state | Visual-only edit/cancel/cancelled-status behavior | No for first phase | Local-only visual mutation | Real edit/cancel booking mutations are high-risk and must be explicitly gated. |

## Existing API/backend evidence

Repo inspection found the following relevant existing surfaces. This list documents what exists; it does not claim mobile production readiness for every item.

| Path / File | Purpose | Likely mobile consumer | Read-only or mutation | Production-ready, demo-only, incomplete, or unclear | Auth requirement noticed | Environment/config dependency |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/mobile/src/config/api.ts` | Mobile API base URL selection | All mobile API clients | Read-only config | Present and usable | None | `EXPO_PUBLIC_REZNO_API_BASE_URL`, then `app.json` `extra.apiBaseUrl`, then localhost fallback |
| `apps/mobile/src/api/client.ts` | Central mobile JSON GET helper | Read-only mobile API calls | Read-only GET only | Present and useful first boundary | None inside helper | Uses `API_BASE_URL`; centralizes response/error parsing for GET |
| `apps/mobile/src/api/marketplace.ts` | Mobile marketplace client | Home/Search Map/read-only business discovery | Read-only | Present | None | Calls `/api/mobile/marketplace` |
| `apps/mobile/src/types/marketplace.ts` | Mobile marketplace response types | Marketplace adapter and UI | Type-only | Present | None | Matches current mobile marketplace endpoint |
| `app/api/mobile/marketplace/route.ts` | Public mobile marketplace JSON endpoint | Home nearby, Search Map results, category/search discovery | Read-only | Present and safest existing mobile API | No explicit auth; rate limited | Staging DB and Next.js API runtime |
| `features/marketplace/services/marketplace.ts` `searchMarketplace` | Web/server marketplace search service reused by mobile endpoint | Home/Search results/category/nearby | Read-only | Present; mobile endpoint already depends on it | No explicit auth for public search | Prisma/database |
| `features/marketplace/services/marketplace.ts` `getMarketplaceFilters` | Public filters for categories/cities | Category/filter UI | Read-only | Present through mobile marketplace response filters | No explicit auth | Prisma/database |
| `features/marketplace/services/marketplace.ts` `getPublicBusiness` | Public business detail model for web pages | Salon Detail/business detail/service list/team/reviews | Read-only | Server service exists, but mobile JSON route not found | No explicit auth in service | Prisma/database |
| `features/marketplace/services/marketplace.ts` `getPublicProfessionalProfile` | Public professional profile/service list for web pages | Staff detail/staff service context | Read-only | Server service exists, but mobile JSON route not found | No explicit auth in service | Prisma/database |
| `app/[slug]/page.tsx` | Web public business profile route | Not mobile JSON | Read-only HTML/page | Web route only | No explicit auth | Uses `getPublicBusiness` |
| `app/[slug]/staff/[staffSlug]/page.tsx` | Web public staff profile route | Not mobile JSON | Read-only HTML/page | Web route only | No explicit auth | Uses `getPublicProfessionalProfile` |
| `features/bookings/services/slots.ts` | Slot generation based on service, staff, hours, blocked times, bookings | Date/Time slots | Read-only calculation | Server service exists; no mobile JSON route found | No direct auth in function; caller controls access | Prisma/database; timezone logic |
| `features/bookings/services/bookings.ts` `getPublicOfferings` | Public bookable offerings | Service discovery | Read-only | Server service exists; not exposed as mobile JSON | No explicit auth | Prisma/database |
| `features/bookings/services/bookings.ts` `getCustomerBookings` / `getCustomerBookingDetails` | Customer booking list/detail | My Bookings/Booking Detail | Read-only | Server service exists for web authenticated routes; no mobile JSON route found | Requires customer identity | Better Auth/session + Prisma |
| `features/bookings/actions/manage-bookings.ts` `createBooking` | Booking creation | Future booking confirmation | Mutation | Existing web server action; high risk for mobile | Requires customer identity and rate limit | Prisma/database; slot conflict checks |
| `features/bookings/actions/manage-bookings.ts` `cancelCustomerBooking` / `rescheduleCustomerBooking` | Customer booking mutations | Future cancel/edit/reschedule | Mutation | Existing web server actions; high risk for mobile | Requires customer identity | Prisma/database; lifecycle policies |
| `features/restaurants/services/reservations.ts` | Restaurant reservation page data / table conflict helpers | Restaurant booking path later | Read-only helper + conflict logic | Server services exist; no mobile JSON route found | Mixed by caller | Prisma/database |
| `features/restaurants/actions/create-reservation.ts` | Restaurant table reservation creation | Future restaurant booking | Mutation | Existing web server action; high risk for mobile | Requires customer identity and rate limit | Prisma/database; notification creation |
| `features/favorites/services/favorites.ts` | Favorite business/service reads | Favorites screen, favorite state | Read-only | Server services exist; no mobile JSON route found | Optional/current customer identity depending method | Better Auth/session + Prisma |
| `features/favorites/actions/favorites.ts` | Toggle favorite business/service | Favorite heart actions | Mutation | Existing web server actions; high risk until auth/mobile contract is clear | Requires customer identity | Prisma/database |
| `apps/mobile/src/auth/client.ts` | Better Auth Expo mobile client | Future mobile auth/session | Auth client | Present but UI not wired for real auth flow | Better Auth | Uses `API_BASE_URL`, Expo SecureStore |
| `app/api/auth/[...all]/route.ts` | Better Auth API route | Mobile auth/session and web auth | Auth/mutation | Present | Better Auth | Trusted origin/env config and staging URL |
| `features/profile/services/profile.ts` / `features/customer/services/account-home.ts` | Profile/account data services | Account/Profile screen | Read-only | Web/server services exist; no mobile JSON route found | Requires identity | Better Auth/session + Prisma |
| `features/messages/services/messages.ts` | Messages list/unread previews | Messages/booking support later | Read-only | Server service exists; no mobile JSON route found | Requires role identity | Better Auth/session + Prisma |
| `features/messages/actions/messages.ts` | Start/send/read messages | Messages later | Mutation | Existing web server actions; not first integration | Requires identity/permissions/rate limit | Prisma/database/notifications |
| `features/notifications/services/notifications.ts` | Dashboard notifications | Notifications/account later | Read-only | Server service exists; no mobile JSON route found | Requires identity | Better Auth/session + Prisma |
| `features/notifications/actions/admin-notifications.ts` | Admin notification creation | Not mobile customer first pass | Mutation | Admin-only web action | Requires admin permission | Prisma/database |
| `prisma/schema.prisma` | Business, service, staff, availability, booking, favorites, messages, notifications, auth models | All real-data domains | Schema only | Existing data model appears broad enough for public read-only discovery and later bookings | N/A | PostgreSQL |

Not found in repo inspection:

- `GET /api/mobile/businesses/[slug]` or equivalent mobile business detail JSON endpoint.
- Mobile JSON service list endpoint separate from marketplace.
- Mobile JSON staff list endpoint.
- Mobile JSON availability/date/time slots endpoint.
- Mobile JSON customer booking list/detail endpoint.
- Mobile JSON favorites read/write endpoints.
- Mobile JSON payment methods/payment intent endpoints.
- Mobile JSON notifications/messages endpoints.
- Mobile JSON profile/account endpoint.

## Needed API contracts by mobile screen

| Screen / Feature | Needed data | Needed endpoint/contract | Read-only or mutation | Auth needed? | Priority | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Home business discovery | Nearby/recommended businesses, rating, price, category, media, city/distance | Existing `GET /api/mobile/marketplace` plus adapter | Read-only | No | P0 | Exists, safest first |
| Search results | Query/category/city/vertical/location filtered businesses | Existing `GET /api/mobile/marketplace?q=&category=&city=&vertical=&lat=&lng=&radius=&limit=` | Read-only | No | P0 | Exists |
| Category filtering | Category slugs/labels and filtered businesses | Existing marketplace `filters.categories` plus `category` query | Read-only | No | P0 | Partially exists |
| Business detail | Business profile, cover/logo, branches, hours, services, team, reviews, contact links | Needed mobile contract, likely `GET /api/mobile/businesses/[slug]` | Read-only | No | P1 | Missing mobile JSON endpoint |
| Service list | Branch services with prices, duration, staff mode, category, availability flag | Business detail endpoint or `GET /api/mobile/businesses/[slug]/services` | Read-only | No | P1 | Missing mobile JSON endpoint |
| Staff list | Public staff for selected service/branch, rating/role/photo/specialties | `GET /api/mobile/services/[branchServiceId]/staff` or included in business detail | Read-only | Probably no for public staff | P2 | Missing mobile JSON endpoint |
| Availability/date/time slots | Date/time slots, staff ids/names, unavailable reasons | `GET /api/mobile/availability?branchServiceId=&date=&memberId=` | Read-only | No for public booking slots, unless business policy requires auth | P2 | Server slot service exists; endpoint missing |
| Favorites | Favorite businesses/services, favorite state | `GET /api/mobile/favorites`; `POST/DELETE /api/mobile/favorites/...` later | Read/write | Yes | P3 | Web services/actions exist; mobile JSON missing |
| Account/profile | Current session, person/profile data | `GET /api/auth/get-session`; future `GET /api/mobile/me` | Read-only first | Yes | P3 | Auth session route exists; mobile profile contract missing |
| Booking list | Customer bookings, status, business/service/date/time/staff/actions | `GET /api/mobile/bookings?filter=` | Read-only | Yes | P2/P3 | Web service exists; mobile JSON missing |
| Booking detail | One customer-owned booking with lifecycle permissions | `GET /api/mobile/bookings/[id]` | Read-only | Yes | P2/P3 | Web service exists; mobile JSON missing |
| Booking create | Branch service, selected staff/time, notes | `POST /api/mobile/bookings` | Mutation | Yes | P4 | Web server action exists; mobile API missing; high risk |
| Booking edit/reschedule | New date/time/staff with conflict checks | `POST/PATCH /api/mobile/bookings/[id]/reschedule` | Mutation | Yes | P4 | Web server action exists; mobile API missing; high risk |
| Booking cancel | Cancellation reason and lifecycle checks | `POST/PATCH /api/mobile/bookings/[id]/cancel` | Mutation | Yes | P4 | Web server action exists; mobile API missing; high risk |
| Payment methods | Saved methods, cash/pay-at-venue availability, payment intent prerequisites | `GET /api/mobile/payments/methods` later | Read-only then mutation | Yes | P5 | Not found |
| Payment confirmation | Payment intent/status/receipt | Payment provider contract later | Mutation | Yes | P5 | Not found; do not start now |
| Notifications/messages | Notification list, unread count, message threads | `GET /api/mobile/notifications`, `GET /api/mobile/messages` later | Read-only first; mutations later | Yes | P6 | Web services/actions exist; mobile JSON missing |
| Map/location/search nearby | Nearby businesses by coordinates, permission-denied state, map marker model | Existing marketplace `lat/lng/radius`; no real map SDK | Read-only | No for public search; permissions only if geolocation added | P1/P2 | Endpoint supports coordinates; mobile geolocation/map remains visual-only |

## Recommended integration order

### Phase 30A / 31 - Read-only business discovery

Start with public, read-only data only:

- Home nearby businesses.
- Category filter mapping.
- Search Map result list.
- Business detail planning.
- Service list planning.

Use the existing `GET /api/mobile/marketplace` endpoint first. If the mobile visual model requires fields not available in the endpoint, document the gap before changing backend code.

### Phase 32 - Read-only booking support

After business discovery is stable:

- Staff list.
- Availability/time slots.
- Existing booking list/detail if authenticated mobile session boundaries are approved.

This phase should still avoid mutations. Slot generation can reuse `features/bookings/services/slots.ts` only through a reviewed mobile JSON contract.

### Phase 33 - User/account/favorites

After auth/session handling is verified on mobile:

- Account/profile read.
- Favorites read.
- Favorites write only if auth boundary, optimistic UI, and rollback/error states are defined.

### Phase 34 - Booking mutations

Only after read-only detail/staff/availability/account data are stable:

- Create booking.
- Edit/reschedule booking.
- Cancel booking.

These require explicit CTO approval because they create or mutate customer data and trigger lifecycle history.

### Phase 35 - Payments

Payments must remain gated until booking mutation behavior is stable:

- Payment method intent.
- Checkout.
- Confirmation.
- Payment status.

Do not add payment SDK/provider behavior in read-only phases.

### Phase 36 - Notifications/messages

Add after booking/auth foundations:

- Notification center.
- Booking messages.
- Reminder events.

Start read-only first, then add send/read mutations later.

## Safe first implementation recommendation

Start with read-only marketplace/business data only.

Recommended first implementation target:

- Replace static nearby business cards with adapter-backed data from `GET /api/mobile/marketplace`.
- Optionally let Search Map render the same loaded marketplace businesses instead of the static `featuredBusinesses`.
- Keep Salon Detail static until a mobile business-detail contract is approved, unless Phase 31 explicitly adds that read-only endpoint.

If existing business/search/detail APIs are considered ready:

- Use `GET /api/mobile/marketplace` for list/search/category data.
- Create an adapter from `MobileMarketplaceBusiness` to the existing mobile visual card model.

If APIs are missing or unclear:

- Create a backend contract document first for business detail/service list/staff/availability.

Explicitly do not start with:

- Booking creation.
- Payments.
- Auth-heavy flows.
- Cancellation/edit mutations.
- Notifications/messages mutations.

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Demo UI currently assumes static/local objects | API responses may not match current visual model | Use typed adapters before replacing demo data |
| Backend contracts may not match mobile visual model | UI may need unsafe broad rewrites | Keep one screen/domain per PR |
| Auth/session boundary may be unclear | Account/favorites/bookings may leak or fail | Gate auth-required endpoints separately |
| Booking/payment mutations are high risk | Real customer data/payment side effects | Read-only first; explicit CTO approval before mutations |
| Real availability logic can conflict with current visual-only time slots | User can see unavailable or inconsistent slots | Introduce availability endpoint and no-availability states before booking create |
| Staging API base URL must be used | Dev builds could hit localhost or wrong environment | Continue using `EXPO_PUBLIC_REZNO_API_BASE_URL` and avoid hardcoded production URLs |
| Offline/error/loading states are not fully designed | Real-data failures can produce poor UX | Define loading/empty/error/retry states before each integration PR |
| Empty states and API failure states require UI treatment | First real-data PR may expose gaps | Reuse `PremiumStateCard` patterns where possible |
| Physical Android phone smoke still not run | Dev-client emulator confidence only | Run physical phone smoke before production release gates |
| Production release still requires QA gate | Visual/data readiness may be overstated | Keep release readiness blocked until QA confirms |

## Required UI states for real data

Future real-data PRs must account for:

- Loading.
- Skeleton/loading cards.
- Empty results.
- API error.
- Retry.
- Unauthenticated user.
- Logged-in user.
- Permission denied if location is later added.
- No availability.
- Booking conflict.
- Payment failed.
- Booking canceled.
- Network offline.

Do not implement these in this planning phase. They are acceptance requirements for future integration PRs.

## Mobile API client boundary recommendation

The current mobile boundary should remain centralized:

- Use `apps/mobile/src/config/api.ts` for base URL selection.
- Keep priority:
  1. `EXPO_PUBLIC_REZNO_API_BASE_URL`
  2. `app.json` `extra.apiBaseUrl`
  3. localhost fallback for local development only
- Use `apps/mobile/src/api/client.ts` for central fetch/error handling.
- Avoid hardcoded production URLs.
- Avoid direct `fetch` calls scattered through visual components.
- Introduce small typed API files per domain, for example:
  - `apps/mobile/src/api/businesses.ts`
  - `apps/mobile/src/api/bookings.ts`
  - `apps/mobile/src/api/favorites.ts`
- Keep each API client read-only until mutation phases are explicitly approved.
- Convert backend responses through adapters before UI components receive them.

No code changes were made in this phase.

## Data model adapter recommendation

Current visual objects should not be directly coupled to backend response shapes.

Recommended adapters/mappers:

- Business API response -> Mobile business card model.
- Business detail API response -> Salon Detail visual model.
- Service API response -> Service row model.
- Staff API response -> Staff Selection model.
- Availability API response -> Date/Time slot model.
- Booking API response -> My Bookings / Booking Detail model.
- Favorite API response -> favorite state model.
- Notification/message API response -> account/notification/message preview model.

Adapters should live near the mobile API/types boundary, not inside large visual components.

## Forbidden areas for first integration

Do not start first integration with:

- Payment SDK.
- Booking mutation.
- Cancellation mutation.
- Reschedule/edit mutation.
- Database migration.
- Prisma schema change.
- Auth rewrite.
- Notification system.
- Message send/read mutation.
- Map/geolocation SDK.
- Production release config.
- EAS/deployment changes.
- Expo publish/update.

## Acceptance criteria for future real-data PRs

Future real-data PRs must satisfy:

- Small scoped PR.
- One screen/domain at a time.
- Read-only before mutations.
- No mixed backend + UI overhaul in one PR.
- Validation passes.
- Staging API URL used for smoke.
- Loading/error/empty states handled.
- No production secret leakage.
- No payment/booking side effects unless explicitly approved.
- No Prisma schema/migration unless explicitly approved for that sprint.
- BlueStacks/dev-build smoke after integration.
- Physical-device smoke before production release claims.
- Clear rollback path if staging API fails.

## Current decision

**READY FOR REAL-DATA PLANNING REVIEW / NOT READY FOR DATA MUTATION IMPLEMENTATION**

Reason:

- Planning and API audit are complete.
- The safest existing mobile API is the public read-only marketplace endpoint.
- Read-only integration can be planned next.
- Auth, booking mutations, payments, notifications, and messages remain gated.

## Recommended next action

Recommended next action:

**Mobile Phase 31 - Integrate Read-Only Business Discovery Data**

Phase 31A staging data readiness is tracked in [mobile-phase-31a-marketplace-staging-data-readiness.md](./mobile-phase-31a-marketplace-staging-data-readiness.md) to verify staging marketplace data before relying on the mobile success-with-data path.

Reason:

- Existing `GET /api/mobile/marketplace` endpoint and mobile client already exist.
- This can replace static nearby/search result cards through adapters without touching booking/payment/auth mutations.

If the team wants to include real Salon Detail data in the next phase:

**Backend/API Contract Phase - Business Detail and Services Mobile API Contract**

Alternative:

**Mobile Phase 29C - Media Assets and Figma Fidelity Pass**
