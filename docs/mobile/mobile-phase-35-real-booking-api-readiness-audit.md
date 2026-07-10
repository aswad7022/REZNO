# Mobile Phase 35 — Real Booking API Readiness Audit

## Status

**AUDIT COMPLETE / NO REAL BOOKING INTEGRATION IMPLEMENTED**

This phase audits the existing REZNO web/backend booking surfaces and the current mobile booking draft flow so the next implementation phase can connect real booking creation safely. No runtime mobile code, API route, backend service, Prisma schema, migration, seed data, package file, EAS/deployment config, auth logic, payment logic, or booking mutation behavior was changed.

This document does not create bookings, call staging/production mutation endpoints, run migrations, run seed scripts, or request database credentials.

## Executive summary

- A booking creation path exists today, but it is a **Next.js server action for the authenticated web customer booking flow**, not a mobile JSON API endpoint.
- The existing web booking creation entry point is `createBooking(formData)` in `features/bookings/actions/manage-bookings.ts`.
- The web route that renders the form is `/customer/bookings/new`, implemented by `app/customer/bookings/new/page.tsx` and `features/bookings/components/new-booking-page.tsx`.
- The create flow expects backend IDs and ISO timestamps, not the current mobile visual labels.
- The backend already has strong booking validation, slot regeneration, conflict checks, blocked-time checks, customer auth, rate limiting, transactional creation, status history, and customer/business revalidation.
- The mobile app currently has a local visual booking draft flow. It is not ready to create real bookings because it stores display labels/local visual IDs and does not yet carry the backend identifiers required by the server action.
- No `POST /api/mobile/bookings` route, mobile booking list/detail JSON route, mobile staff endpoint, or mobile availability endpoint was found.
- The safest next phase is **Mobile Phase 36 — Mobile BookingDraft ID Readiness**, before any real booking mutation is attempted.

## Existing booking creation surface

| Item | Finding |
| --- | --- |
| Existing create surface | `createBooking(formData)` |
| File | `features/bookings/actions/manage-bookings.ts` |
| Runtime shape | Next.js server action (`"use server"`) |
| Web route that renders it | `/customer/bookings/new` |
| Rendering files | `app/customer/bookings/new/page.tsx`, `features/bookings/components/new-booking-page.tsx` |
| HTTP method visible to mobile | No stable public/mobile HTTP JSON method found |
| Request payload shape | `FormData`, not JSON |
| Response shape | Redirect/revalidate behavior, not JSON |
| Mobile readiness | Not directly safe for mobile as-is; needs a mobile API contract or adapter endpoint |

### Current web create payload

The web form in `features/bookings/components/new-booking-page.tsx` submits hidden inputs to the `createBooking` server action:

| Field | Source / type | Validation |
| --- | --- | --- |
| `branchServiceId` | `BranchService.id` UUID | Required UUID |
| `date` | `YYYY-MM-DD` string | Required date regex |
| `startsAt` | Slot start ISO datetime string | Required datetime |
| `memberId` | Staff `OrganizationMember.id` UUID or empty string | UUID or `""`, transformed to `null` |

Validation is defined in `features/bookings/schemas/booking.ts`:

- `branchServiceId`: `z.string().uuid()`
- `date`: `YYYY-MM-DD`
- `startsAt`: datetime string
- `memberId`: UUID or empty string transformed to `null`

### Current web create response behavior

`createBooking` does not return JSON for a mobile client. It:

- redirects to `/customer/bookings/new?...error=rateLimited` when rate limited;
- redirects with `invalid`, `unavailable`, or `failed` errors for validation/unavailability/failure;
- revalidates customer and business booking pages on success;
- redirects to `/customer/bookings/{bookingId}?created=1` after successful creation.

This is appropriate for the web form flow, but a future mobile integration should use a JSON contract with explicit success/error payloads.

## Auth and session requirements

Booking creation requires an authenticated, onboarded customer:

- `createBooking` calls `requireCustomerIdentity()`.
- `requireCustomerIdentity()` delegates to `requireOnboardedIdentity()` in `features/identity/server.ts`.
- Identity is derived from Better Auth via `auth.api.getSession({ headers })`.
- The created booking uses `identity.person.id` as `customerId`.

Mobile auth support exists but is not yet wired into booking creation:

- `apps/mobile/src/auth/client.ts` defines a Better Auth Expo client using `@better-auth/expo/client`.
- It stores auth state with Expo SecureStore and uses `API_BASE_URL`.
- `app/api/auth/[...all]/route.ts` exposes Better Auth routes.
- `lib/auth/auth.ts` includes the Better Auth Expo plugin.

Before mobile booking mutation, the team must confirm that a real device/dev-client mobile session can call authenticated API routes consistently against staging, including cookie/token behavior, onboarding state, and error handling.

## Existing validation, availability, and conflict checks

The current web booking creation path already performs meaningful server-side safety checks:

1. Customer auth through `requireCustomerIdentity()`.
2. Rate limiting with `consumeRateLimit("booking:create", identity.person.id, { limit: 6, windowMs: 60_000 })`.
3. Payload validation with `createBookingSchema.safeParse`.
4. Slot regeneration with `generateBookingSlots(branchServiceId, date)`.
5. Exact selected slot matching on both `startsAt` and `memberId`.
6. Offering visibility/availability checks for `BranchService`, `Service`, `Branch`, `Organization`, and `OrganizationSettings`.
7. Past-time guard with `startsAt <= new Date()`.
8. Serializable Prisma transaction.
9. Active booking overlap check for statuses `PENDING` and `CONFIRMED`.
10. Branch/member blocked-time overlap check.
11. `BookingStatusHistory` creation with `toStatus: "CONFIRMED"`.

The slot service in `features/bookings/services/slots.ts` additionally validates date format, business hours, staff assignment mode, staff availability, blocked times, existing active bookings, and timezone-specific slot generation.

## Existing booking list/detail surfaces

Current booking list/detail surfaces are web/server-rendered, not mobile JSON endpoints.

| Surface | File(s) | Data source | Auth | Mobile readiness |
| --- | --- | --- | --- | --- |
| Customer booking list | `app/customer/bookings/page.tsx`, `features/bookings/components/customer-bookings-page.tsx` | `getCustomerBookings()` | Customer identity | Needs mobile JSON endpoint |
| Customer booking detail | `app/customer/bookings/[bookingId]/page.tsx`, `features/bookings/components/customer-booking-details-page.tsx` | `getCustomerBookingDetails(bookingId)` | Customer identity | Needs mobile JSON endpoint |
| Customer upcoming/history pages | `app/customer/bookings/upcoming/page.tsx`, `app/customer/bookings/history/page.tsx` | `getCustomerBookings(filter)` | Customer identity | Needs mobile JSON endpoint |
| Business bookings | `app/business/bookings/page.tsx`, `features/bookings/components/business-bookings-page.tsx` | `getBusinessBookings()` | Business identity | Not first mobile customer target |
| Business calendar | `app/business/calendar/page.tsx`, `features/bookings/components/business-calendar-page.tsx` | Booking services/calendar data | Business identity | Not first mobile customer target |
| Booking reschedule/change | customer/business reschedule pages plus `features/bookings/actions/manage-bookings.ts` | Server actions | Customer/business identity | Mutation; must stay gated |

No mobile JSON booking list/detail route was found under `app/api`. Current `app/api` routes are:

- `app/api/auth/[...all]/route.ts`
- `app/api/mobile/marketplace/route.ts`

## Existing reservation surface

There is a separate restaurant reservation creation server action:

- `createRestaurantReservation(formData)` in `features/restaurants/actions/create-reservation.ts`
- Web route context: `app/[slug]/reserve/page.tsx`
- Auth: `requireCustomerIdentity()`
- Rate limit: `restaurantReservation:create`
- Payload includes `slug`, `branchId`, `tableId`, `startsAt`, `guestCount`, `durationMinutes`, and `customerNote`.
- It creates a `Booking` plus `RestaurantReservationDetails` and notifications.

This is not a general mobile booking creation endpoint and should not be reused blindly for the current salon/service booking flow. Restaurant/table reservations should remain a later domain-specific integration.

## Data model requirements

Booking creation currently depends on these Prisma models and relations:

| Model | Relevant fields / purpose |
| --- | --- |
| `Person` | Customer identity via `Person.id`; connected to Better Auth user through `authUserId`; owns `customerBookings`. |
| `Organization` | Business owner entity; must be active/not deleted; owns services, branches, members, settings, bookings. |
| `OrganizationSettings` | `bookingEnabled`, `marketplaceVisible`, `staffSelectionMode`, `allowOnlinePayments`, `cancellationWindowHours`. |
| `Branch` | Location/branch; status, timezone, business hours, assignments, blocked times, bookings. |
| `Service` | Service definition; status, category, staff selection mode, staff assignments. |
| `BranchService` | Bookable offering; required `id`, `branchId`, `serviceId`, `price`, `durationMinutes`, `isAvailable`. This is the key service ID current booking creation expects. |
| `OrganizationMember` | Staff/professional; optional `memberId` on booking; uses availabilities and assignments for slot generation. |
| `Availability` | Member availability by branch/day/time. |
| `BusinessHour` | Branch opening windows by day. |
| `BlockedTime` | Branch or staff blocked periods; used in conflict checks. |
| `Booking` | Main booking record. Required IDs: `organizationId`, `branchId`, `customerId`, `branchServiceId`; optional `memberId`; `startsAt`, `endsAt`, snapshots, status. |
| `BookingStatusHistory` | Lifecycle history row created on booking creation. |
| `BookingChangeRequest` | Reschedule/change workflow; not required for initial create. |
| `Review` | Post-completion customer review; not required for initial create. |
| `RestaurantReservationDetails` | Restaurant-specific extension; not required for salon/service booking create. |

Important `Booking` fields:

- `organizationId`, `branchId`, `customerId`, `branchServiceId`, optional `memberId`
- `status`
- `startsAt`, `endsAt`
- `serviceNameSnapshot`, `customerNameSnapshot`, `priceSnapshot`
- optional `notes`, `cancellationReason`, `cancelledAt`
- relations to status history, change requests, review, restaurant details, conversations

Important indexes include branch/member overlap indexes and customer/status/start-time indexes.

## Current mobile booking draft vs backend needs

The current mobile app defines `BookingDraft` in `apps/mobile/App.tsx` with display-oriented local fields:

| Mobile `BookingDraft` field | Current role | Backend create requirement gap |
| --- | --- | --- |
| `bookingMethod` | Local visual choice: REZNO picks or manual | No backend equivalent in current `createBooking`; future API must decide whether it affects `memberId` selection. |
| `businessName` | Display label | Backend needs `organizationId`/`branchId` derived from a real offering. |
| `serviceName` | Display label | Backend needs `branchServiceId`; service name is only snapshotted server-side. |
| `servicePrice` | Display label | Backend derives `priceSnapshot` from `BranchService.price`; client price should not be trusted. |
| `specialistName` | Display label | Backend needs `memberId` UUID or `null`; staff name alone is insufficient. |
| `selectedDateId` | Local demo date ID | Backend needs `date` as `YYYY-MM-DD`. |
| `dateLabel` | Display label | Must be generated from a real date selection, not parsed from localized UI text. |
| `selectedTimeId` | Local demo time ID | Backend needs selected slot `startsAt` ISO datetime from slot endpoint. |
| `timeLabel` | Display label | Insufficient for conflict-safe booking. |
| `paymentMethod` | Visual/local payment choice | Current `createBooking` has no payment method field. Payment remains gated. |

Current mobile state is good for visual flow but not sufficient for real booking mutation.

## Current mobile API/client state

Mobile API support currently covers read-only marketplace data:

- `apps/mobile/src/config/api.ts`
  - Uses `EXPO_PUBLIC_REZNO_API_BASE_URL`, then Expo config `extra.apiBaseUrl`, then `http://localhost:3000`.
- `apps/mobile/src/api/client.ts`
  - Provides `mobileApiGet<T>()` with JSON parsing and API error handling.
  - It is GET-only and does not attach auth/session headers explicitly.
- `apps/mobile/src/api/marketplace.ts`
  - Calls `GET /api/mobile/marketplace`.
- `apps/mobile/src/types/marketplace.ts`
  - Defines `MobileMarketplaceBusiness`.

The marketplace response exposes business-level IDs and display data such as `id`, `slug`, `name`, category, matching service display name/price, service count, starting price, location fields, and `publicPath`.

It does **not** expose the `BranchService.id`, staff/member IDs, generated slot IDs/ISO timestamps, or booking payload information required by `createBooking`.

## Can mobile safely call the existing create path later?

Not directly in its current shape.

The current create path is safe on the server, but it is web-form/server-action oriented:

- It expects `FormData`.
- It redirects instead of returning JSON.
- It depends on Next server-action/browser flow semantics.
- It assumes server-side auth identity from the current web request.
- It does not expose a mobile-friendly error code contract.
- It does not accept or return a mobile booking confirmation payload.

A future mobile integration should either:

1. create a dedicated authenticated JSON endpoint such as `POST /api/mobile/bookings`; or
2. introduce a typed route handler that reuses the same validation/conflict/transaction core logic after extracting the shared create routine from the server action.

Do not bypass the existing server-side slot regeneration and conflict checks. The mobile client should only submit backend IDs and selected server-generated slot data; the server must remain authoritative.

## Missing before real mobile booking integration

1. Mobile business/service detail contract exposing `branchServiceId`, service duration, staff mode, and branch timezone.
2. Mobile staff contract exposing staff/member IDs when manual professional selection is allowed.
3. Mobile availability/slot contract exposing server-generated `startsAt`, `endsAt`, `memberId`, and `memberName`.
4. Authenticated JSON booking create route with success/error payloads instead of redirects.
5. Mobile auth/session confirmation on real devices/staging.
6. BookingDraft ID readiness so local state carries backend IDs and ISO values alongside display labels.
7. Mobile error and retry UX for invalid payload, unavailable slot, conflict, rate limit, unauthenticated, server failure, and offline/network failure.
8. Payment boundary definition; current booking create does not process payment method, and the mobile Payment screen must remain visual until payment contracts are approved.

## Risk assessment

| Risk | Why it matters | Recommended mitigation |
| --- | --- | --- |
| Duplicate booking creation | Users may retry a mutation on network errors or double tap | Add idempotency/client request ID before real mobile create if needed; keep rate limit and transaction checks. |
| Missing `branchServiceId` | Mobile currently stores service labels/prices | Add read-only service detail payload before booking create. |
| Missing `memberId` | Mobile staff names are not backend IDs | Add staff endpoint or include staff candidates in availability response. |
| Timezone/date parsing | Mobile labels like localized day/time strings are not authoritative | Use `YYYY-MM-DD` plus server-generated ISO slot timestamps. |
| Availability drift | A slot can disappear between display and create | Continue regenerating slots server-side at create time. |
| Payment mismatch | Mobile has visual payment methods; server create has no payment method | Keep real payment/payment method fields gated until payment phase. |
| Unauthenticated mobile user | Booking create requires customer identity | Confirm Better Auth Expo session and mobile error responses first. |
| Staging data missing | Real flow needs bookable branch services, hours, staff availability | Verify staging has valid `BranchService`, hours, staff, blocked-time coverage before QA. |
| Marketplace data not create-ready | Marketplace endpoint is discovery-oriented | Add detail/service endpoint before mutation. |
| Redirect server action not mobile-safe | Mobile needs JSON response | Do not call server action directly from mobile; add route handler or shared service. |

## Recommended next phases

### Phase 36 — Mobile BookingDraft ID Readiness

Prepare mobile local state for real integration without calling mutations:

- Add optional backend identifier fields to the local draft model in a future implementation PR.
- Keep display labels for UI.
- Carry `businessId`, `slug`, `branchId`, `branchServiceId`, `serviceId` if available.
- Carry `memberId` or `null`.
- Carry `date` as `YYYY-MM-DD`.
- Carry selected slot `startsAt`/`endsAt` ISO timestamps when an availability endpoint exists.
- Preserve visual-only behavior until route contracts are approved.

### Phase 37 — Read-only booking payload builder and dry-run validation

Create a non-mutating client/server boundary for validating that a mobile draft can be transformed into a create-ready payload:

- No real booking creation.
- No database mutation.
- Confirm payload shape, missing IDs, auth requirement, and error mapping.

### Phase 38 — Real booking mutation integration behind a guarded feature flag

Implement `POST /api/mobile/bookings` or an equivalent mobile route only after Phase 36/37:

- Must require authenticated customer.
- Must reuse existing schema/conflict/slot logic.
- Must return JSON success/error.
- Must be guarded and QA-approved.

### Phase 39 — My Bookings real data integration

Add authenticated read-only mobile booking list/detail endpoints:

- `GET /api/mobile/bookings?filter=...`
- `GET /api/mobile/bookings/[id]`
- Keep cancel/edit/reschedule visual until explicitly approved.

### Phase 40 — Booking confirmation from backend response

Replace visual confirmation with backend booking response:

- Booking ID/reference.
- Service/business/staff/date/time/price snapshots.
- Server-confirmed status.
- Clear conflict/error handling.

## Current decision

**READY FOR API READINESS REVIEW / NOT READY FOR REAL BOOKING MUTATION**

Reason:

- The audit identifies the existing safe web booking creation logic and the missing mobile JSON contracts.
- The backend has a strong create flow, but mobile cannot safely call it yet.
- The next phase should prepare mobile draft IDs and read-only detail/availability contracts before any mutation is attempted.

## Safety confirmations

- No real bookings were created.
- No mutation endpoints were called.
- No database, Prisma schema, migration, seed, auth, payment, package, mobile runtime, backend, EAS, or deployment files were changed.
- No secrets were printed.
- This phase only adds documentation.
