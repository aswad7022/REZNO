# Mobile Phase 31 - Read-Only Business Discovery Integration

## Status

**READ-ONLY BUSINESS DISCOVERY INTEGRATED / NO MUTATIONS IMPLEMENTED**

This phase connects the REZNO mobile discovery surfaces to the existing public marketplace API. It does not implement booking creation, booking edit, booking cancellation, payment, auth-heavy flows, favorites, notifications/messages, schema changes, database changes, backend route changes, EAS builds, or deployment changes.

## Scope

Implemented scope:

- Home nearby business cards now use existing marketplace API data when the API succeeds.
- Search Map result cards now use the same API-backed business list when available.
- Salon Detail can open from the adapted read-only marketplace business object.
- Static services, staff, date/time, payment, confirmation, and booking management remain visual/local only.
- Demo business data remains only for visual-only fallback areas outside the Phase 31 discovery target, such as Favorites preview suggestions.

## API used

Existing API boundary used:

- `GET /api/mobile/marketplace`

Existing mobile client/config used:

- `apps/mobile/src/config/api.ts`
- `apps/mobile/src/api/client.ts`
- `apps/mobile/src/api/marketplace.ts`
- `apps/mobile/src/types/marketplace.ts`

API base URL priority remains:

1. `EXPO_PUBLIC_REZNO_API_BASE_URL`
2. `app.json` `extra.apiBaseUrl`
3. localhost fallback for local development

No staging or production URL was hardcoded into app code.

## Adapter

Adapter path:

- `apps/mobile/src/api/marketplace-adapter.ts`

Adapter type:

- `MobileDiscoveryBusiness`

Mapping summary:

- API `id` -> mobile business `id`
- API `name` -> mobile business `name`
- API `categoryName` or `vertical` -> mobile business `category`
- API `city`, `branch.locationLabel`, or `branch.nearbyLandmark` -> mobile business `location`
- API `distanceKm`, city, or branch location fallback -> mobile business `distance`
- API `averageRating` -> mobile business `rating`
- API `reviewCount` -> mobile business `reviewCount`
- API `matchingServicePrice` or `startingPrice` -> mobile business `price`
- API `matchingServiceName`, service count, or vertical -> mobile business `tag`
- API menu/table/service signals -> mobile business `status`

Fallback rules:

- Missing name becomes a safe Arabic "available business" label.
- Missing category falls back to a vertical label.
- Missing distance falls back to city/location or "قريب منك".
- Missing price becomes "السعر عند الحجز".
- Missing rating becomes "جديد".
- Missing review count becomes `0 تقييم`.

The large visual components do not consume raw API responses directly.

## UI states

Home nearby business area:

- Loading: shows premium Arabic loading state while the marketplace API fetch runs.
- Success: renders adapted API-backed business cards.
- Empty: shows Arabic empty state and retry action.
- Error: shows Arabic error state and retry action.
- Retry: re-runs the marketplace API request.

Search Map result sheet:

- Loading: shows premium Arabic loading state while retaining the visual-only map canvas.
- Success: renders adapted API-backed result cards.
- Empty: shows Arabic empty state and retry action.
- Error: shows Arabic error state and retry action.
- Retry: re-runs the marketplace API request.

Salon Detail:

- Opens from an adapted marketplace business object.
- Uses safe adapted fields for name, category, location, distance, rating, review count, price/status tags.
- Does not call a business-detail endpoint.
- Services/staff/date/time/payment remain static/local visual data.

## Safety

Confirmed non-changes:

- No backend route changes.
- No Prisma schema changes.
- No migrations.
- No database changes.
- No booking creation.
- No booking edit/reschedule.
- No booking cancellation.
- No payment integration.
- No auth integration changes.
- No favorites API integration.
- No notification/message integration.
- No real map/geolocation SDK.
- No package/dependency changes.
- No EAS build.
- No Expo publish/update.
- No EAS Submit.
- No TestFlight.

## Manual smoke notes

Expected conceptual smoke result:

- Home fetches marketplace data through the existing mobile marketplace client.
- Home loading state exists.
- Home empty state exists.
- Home error/retry state exists.
- API-backed business cards render without crash after successful fetch.
- API-backed business cards open Salon Detail through the adapted local object.
- Search Map result sheet uses the same read-only adapted API data where available.
- Existing visual booking flow remains local/static.
- No booking/payment/auth behavior changed.
- No red screen expected.

If the API request cannot be verified locally, the expected blocker is environment/API reachability through `EXPO_PUBLIC_REZNO_API_BASE_URL` or the local fallback. The integration is still bounded to the existing client and endpoint.

## Recommended next action

If Phase 31 is stable:

**Mobile Phase 32 - Business Detail / Service List Read-Only Contract**

Alternative:

**Mobile Phase 31B - Read-Only Marketplace Filtering/Search Polish**

Phase 32 should not add booking/payment mutations. It should define or implement a read-only business detail/service-list contract before replacing the remaining Salon Detail static service data.
