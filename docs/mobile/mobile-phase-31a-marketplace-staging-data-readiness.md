# Backend/API Phase 31A - Marketplace Staging Data Readiness Audit

## Status

**AUDIT COMPLETE / STAGING MARKETPLACE DATA EMPTY**

This phase audits why the existing public mobile marketplace endpoint returns an empty payload on staging and documents the safest path to make staging marketplace data available for mobile read-only testing.

No real data was created or modified in this phase. No database mutation, schema change, migration, backend endpoint change, mobile code change, package change, EAS/deployment action, booking/payment/auth change, or production data operation was performed.

## Owner runtime evidence

Owner-side PowerShell against staging:

```powershell
$response = Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?limit=10"
$response | ConvertTo-Json -Depth 10
```

Observed response:

```json
{
  "data": {
    "businesses": [],
    "pagination": {
      "limit": 10,
      "nextCursor": null,
      "hasMore": false
    },
    "filters": {
      "categories": [],
      "cities": []
    }
  }
}
```

Owner also confirmed:

- `businesses`: `[]`
- `filters.categories`: `[]`
- `filters.cities`: `[]`
- `business count`: `0`

## Endpoint inspected

| Item | Finding |
| --- | --- |
| Endpoint path | `GET /api/mobile/marketplace` in `app/api/mobile/marketplace/route.ts` |
| Service functions used | `searchMarketplace()` and `getMarketplaceFilters()` from `features/marketplace/services/marketplace.ts` |
| Request parameters supported | `q`, `category`, `city`, `vertical`, `lat`, `lng`, `radius`, `limit` |
| Limit behavior | Default `20`, maximum `50`; endpoint queries one extra record to determine `hasMore` |
| Location behavior | `lat`/`lng` must both be valid coordinates; radius must be `1..25` km |
| Vertical behavior | `vertical` must be one of the configured `BusinessVertical` values |
| Rate limiting | Uses `consumeRateLimit("mobile.marketplace", ...)` with 120 requests per minute |
| Response shape | `{ data: { businesses, pagination, filters } }` |
| Cache header | `Cache-Control: public, max-age=30, stale-while-revalidate=120` |
| Reachability | Owner evidence proves the endpoint is reachable on staging |
| Empty response meaning | A 200 response with empty arrays is a valid empty state, not a runtime error |

The endpoint itself does not require auth. It is public read-only and rate-limited.

## Conditions for business visibility

Repo inspection found the following exact visibility requirements for a business to appear in `GET /api/mobile/marketplace`.

### Organization-level requirements

From `features/marketplace/services/marketplace.ts`, `publicOrganizationWhere` requires:

- `Organization.deletedAt` is `null`.
- `Organization.isActive` is `true`.
- `Organization.status` is `ACTIVE`.
- `Organization.settings.bookingEnabled` is `true`.
- `Organization.settings.marketplaceVisible` is `true`.

The Prisma schema confirms relevant defaults:

- `Organization.status` defaults to `ACTIVE`.
- `Organization.isActive` defaults to `true`.
- `OrganizationSettings.bookingEnabled` defaults to `true`.
- `OrganizationSettings.marketplaceVisible` defaults to `true`.

However, the service requires a related `OrganizationSettings` row that satisfies those values. Business onboarding creates this settings row, but a partial/manual data insert would need it explicitly.

### Branch requirements

For all visible businesses:

- At least one branch must be included by the marketplace query.
- Branch must have `deletedAt: null`.
- Branch must have `status: ACTIVE`.

When `city` is provided:

- The organization must have at least one active, non-deleted branch whose `city` contains the query city.
- Returned branches are also filtered by that city condition.

When `lat` and `lng` are provided:

- The organization must have at least one active, non-deleted branch with non-null `latitude` and `longitude` inside the computed bounding box.
- A business is filtered out if nearby search is requested and the computed `distanceKm` is `null`.

`getMarketplaceFilters()` returns `cities` only from active, non-deleted branches with a non-null city whose organization satisfies `publicOrganizationWhere`.

### Service/category requirements for service-based businesses

For non-restaurant/non-cafe verticals:

- At least one active branch must have at least one `BranchService`.
- `BranchService.isAvailable` must be `true`.
- Related `Service.status` must be `ACTIVE`.
- Related service must belong to a `Category`.
- The final marketplace filter requires `serviceCount > 0`.

When `category` is provided:

- The organization must have at least one active service whose category slug equals the requested category.
- Included branch services are also filtered to that category.

`getMarketplaceFilters()` returns `categories` only from categories that have at least one active service whose organization satisfies `publicOrganizationWhere`.

### Restaurant/cafe requirements

For `RESTAURANT` and `CAFE` verticals, the final marketplace filter is different:

- The business still needs at least one active, non-deleted branch.
- The business must have at least one available `MenuItem` or at least one active `RestaurantTable`.
- It does not need `serviceCount > 0` to appear in `businesses`.

Important filter nuance:

- `filters.categories` are still derived from active `Service` rows, not menu items or tables. A restaurant with tables/menu but no active service can appear in `businesses`, while `filters.categories` may still remain empty.

### Search/filter requirements

When `q` is provided:

- Search candidates are collected from matching organization name/slug/profile/category, active branch fields, active service fields, and available menu item fields.
- If the query produces zero candidate organization ids, the endpoint returns `[]`.

When no `q`, `category`, `city`, or location is provided:

- The endpoint still applies the public organization, branch, and offering/menu/table visibility conditions.

### Optional data

The following fields improve the mobile result but are not required for visibility:

- Reviews: only `VISIBLE` reviews contribute `averageRating` and `reviewCount`; missing reviews produce `averageRating: null` and `reviewCount: 0`.
- `BusinessProfile.description`, images, phone, website, gallery, SEO fields.
- Branch latitude/longitude unless nearby location search is requested.
- Branch `city` unless filter lists or city-filtered smoke tests are expected.

## Likely reason staging returns empty

Database contents were not inspected and no staging database query was run in this audit.

Based on repo logic and owner runtime evidence, the most likely reason staging returns empty is:

> The staging database does not currently contain any organization that satisfies the public marketplace visibility conditions plus active branch/offering requirements.

The empty `filters.categories` and `filters.cities` support this:

- `filters.categories: []` means no category currently has an active service attached to a public-visible organization.
- `filters.cities: []` means no active branch with a non-null city belongs to a public-visible organization.
- `businesses: []` means no public-visible organization passed the final business visibility filter:
  - service businesses need `serviceCount > 0`;
  - restaurants/cafes need at least one available menu item or active table.

Other possible causes that cannot be ruled out without inspecting staging DB contents:

- Businesses exist but `marketplaceVisible` is false.
- Businesses exist but `bookingEnabled` is false.
- Businesses exist but organization `status` is not `ACTIVE`.
- Businesses exist but branches are inactive, deleted, missing, or have no city.
- Services exist but are inactive, not connected to an active branch, or `BranchService.isAvailable` is false.
- Restaurant/cafe businesses exist but have neither active tables nor available menu items.
- Data was inserted manually without the required settings/profile/branch/service relationships.

No endpoint code blocker was found in this audit. The endpoint returns a valid empty-state payload.

## Safe remediation options

### Option A - Use existing business/admin UI to create staging data

Use the existing staging UI flows to create or activate businesses, branches, services, and restaurant/table/menu data.

| Attribute | Assessment |
| --- | --- |
| What it changes | Staging database rows through existing app UI/server actions |
| Risk level | Low-to-medium, because it uses existing product flows and avoids ad hoc scripts |
| Owner approval needed | Yes, because it mutates staging data |
| Schema/migrations touched | No |
| Production impact | None if performed only against staging |
| Recommended use | Best first option |

Useful existing paths discovered:

- Business onboarding creates `Organization`, initial `Branch`, `BusinessProfile`, `OrganizationSettings`, owner role, and membership in `features/onboarding/actions/complete-onboarding.ts`.
- Business profile visibility can set `OrganizationSettings.marketplaceVisible` based on published/draft visibility in `features/business/actions/update-business-profile.ts`.
- Business settings can set `bookingEnabled`, `marketplaceVisible`, and `vertical` in `features/business-settings/actions/update-business-settings.ts`.
- Branch create/update supports city, location label, latitude, longitude, and active/inactive status in `features/branches/actions/manage-branch.ts`.
- Service create/update creates active `Service` and related available `BranchService` rows in `features/services/actions/create-service.ts`.
- Restaurant management can create active tables and available menu items in `features/restaurants/actions/manage-restaurant.ts`.

### Option B - Use an existing non-production seed script if present

No standalone safe staging seed script was found in repo inspection.

| Attribute | Assessment |
| --- | --- |
| What it changes | Would mutate staging data if such script existed |
| Risk level | Not currently available |
| Owner approval needed | Yes |
| Schema/migrations touched | No, if script only inserts data |
| Production impact | None only if explicitly pointed at staging |
| Recommended use | Not available in current repo |

The only seed-like item found is migration `prisma/migrations/20260701020000_seed_general_category/migration.sql`, which inserts the `General` category. It does not create marketplace businesses, branches, services, tables, or menu items.

### Option C - Create a minimal staging-only seed plan in a future PR

Create a future, explicitly approved backend/data PR that documents or implements a minimal staging-only marketplace dataset plan.

| Attribute | Assessment |
| --- | --- |
| What it changes | Future docs/script/data plan, then staging data only after owner approval |
| Risk level | Medium, because it introduces a new mutation path |
| Owner approval needed | Yes, both for PR and execution |
| Schema/migrations touched | Should be no |
| Production impact | Must be designed to avoid production entirely |
| Recommended use | Good fallback if UI setup is too slow or inconsistent |

### Option D - Keep PR #85 empty-state behavior and merge later by CTO exception

Merge mobile read-only integration with empty-state behavior verified, then create data afterward.

| Attribute | Assessment |
| --- | --- |
| What it changes | No staging data; mobile continues to show safe empty/error states |
| Risk level | Low code risk, but incomplete success-path QA |
| Owner approval needed | CTO approval required |
| Schema/migrations touched | No |
| Production impact | None |
| Recommended use | Only if CTO accepts no success-with-data smoke before merge |

## Recommended test dataset

To verify PR #85's API success-with-data path, staging should contain at least three marketplace-visible businesses.

### Shared requirements for all test businesses

Each business should have:

- `Organization.status = ACTIVE`.
- `Organization.isActive = true`.
- `Organization.deletedAt = null`.
- `OrganizationSettings.bookingEnabled = true`.
- `OrganizationSettings.marketplaceVisible = true`.
- At least one active, non-deleted branch.
- Branch `city = Baghdad` or equivalent staging city.
- Branch location fields such as `locationLabel` or address.
- Branch coordinates if nearby/distance testing will use `lat`/`lng`.

### 1. Salon / beauty

Suggested identity:

- Name: `Noura Beauty Lounge` or equivalent.
- Vertical: `BEAUTY` or `BARBER`.
- City: `Baghdad`.

Required marketplace data:

- Active branch in Baghdad.
- Active `Category`, for example `Beauty` or existing `General`.
- At least one active `Service`.
- Available `BranchService` for the active branch.
- Starting price through `BranchService.price`.

### 2. Restaurant

Suggested identity:

- Name: `Mat3am Gold` or equivalent.
- Vertical: `RESTAURANT`.
- City: `Baghdad`.

Required marketplace data:

- Active branch in Baghdad.
- At least one active `RestaurantTable` or one available `MenuItem`.
- If menu is used, create an active `MenuCategory` and available `MenuItem`.
- Optional active service/category if category filters should include restaurant-related labels.

### 3. Clinic / dental

Suggested identity:

- Name: `Smile Studio Clinic` or equivalent.
- Vertical: `CLINIC` or `DENTIST`.
- City: `Baghdad`.

Required marketplace data:

- Active branch in Baghdad.
- Active `Category`, for example `Dental`, `Clinic`, or existing `General`.
- At least one active `Service`.
- Available `BranchService` for the active branch.
- Starting price through `BranchService.price`.

## Validation plan after data exists

Run after owner creates or activates staging data:

```powershell
$response = Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?limit=10"
$response.data.businesses.Count
$response.data.filters.categories.Count
$response.data.filters.cities.Count
```

Expected:

- `businesses.Count >= 1`, ideally `>= 3`.
- `categories.Count >= 1`.
- `cities.Count >= 1`.

Then validate PR #85 in the mobile development build/dev-client path:

- Set the approved staging API URL.
- Open the mobile app.
- Home shows API-backed business cards.
- Search Map shows API-backed result cards.
- A business card opens the visual Salon Detail handoff.
- Empty/error/retry states remain safe when the endpoint is unavailable or empty.

## PR #85 decision guidance

Do not merge PR #85 until either:

1. The staging endpoint returns real businesses and the mobile success-with-data path passes visual smoke; or
2. CTO explicitly approves merging with empty-state-only behavior verified.

Recommended decision:

> Hold PR #85 until staging marketplace has at least one visible business, ideally three, and the success path is smoke-tested.

## Safety confirmations

Confirmed for this audit:

- No database mutation performed.
- No schema change.
- No migration.
- No backend endpoint change.
- No mobile code change.
- No package change.
- No EAS build, deployment, publish, or submit.
- No booking, payment, or auth changes.
- No production data touched.
- No secret values printed.

## Recommended next action

Recommended next action:

**Owner creates/activates minimal staging marketplace businesses, then retest PR #85.**

If owner/UI setup is blocked or too slow:

**Backend/API Phase 31B - Create Minimal Staging Marketplace Seed Plan**

Phase 31B seed planning is recorded in [mobile-phase-31b-minimal-staging-marketplace-seed-plan.md](./mobile-phase-31b-minimal-staging-marketplace-seed-plan.md).

Phase 31B should be a separate CTO-approved planning/implementation gate. It should not run data mutations until the owner explicitly approves the exact staging-only execution plan.
