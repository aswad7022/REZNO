# Backend/API Phase 31B - Minimal Staging Marketplace Seed Plan

## Status

**SEED PLAN READY / NO DATA MUTATION EXECUTED**

This phase creates the staging marketplace data plan needed to verify the mobile read-only business discovery success path.

No data was created. No seed was run. No database was mutated. No migration, schema change, backend endpoint change, mobile code change, package change, deployment, EAS action, or production data operation was performed.

PR #85 remains on hold until staging returns visible marketplace businesses and the mobile success-with-data path passes smoke testing.

## Why this plan exists

Mobile Phase 31 PR #85 integrated the existing public read-only endpoint:

```text
GET /api/mobile/marketplace
```

Owner staging evidence showed the deployed endpoint is reachable but returns a valid empty payload:

- `businesses: []`
- `filters.categories: []`
- `filters.cities: []`
- `businesses.Count = 0`

Phase 31A concluded that the endpoint is reachable and the empty response is valid. The likely reason is that staging has no public-visible businesses satisfying marketplace visibility rules.

This plan defines the minimal staging data needed to test:

- Staging API returns visible businesses.
- Mobile adapter receives real marketplace payload.
- Home renders API-backed business cards.
- Search Map renders API-backed result cards.
- Business card handoff opens the existing visual Salon Detail screen.

## Marketplace visibility requirements summary

The requirements below come from:

- `app/api/mobile/marketplace/route.ts`
- `features/marketplace/services/marketplace.ts`
- `prisma/schema.prisma`
- Phase 31A repo inspection

### Organization requirements

Each visible business must be an `Organization` with:

- `deletedAt = null`
- `isActive = true`
- `status = ACTIVE`
- valid `slug`
- valid `name`
- valid `vertical` enum

Valid `BusinessVertical` enum values include:

- `BARBER`
- `BEAUTY`
- `CLINIC`
- `DENTIST`
- `SPA`
- `GYM`
- `CONSULTANT`
- `RESTAURANT`
- `CAFE`
- `OTHER`

### OrganizationSettings requirements

Each visible business must have an `OrganizationSettings` row where:

- `bookingEnabled = true`
- `marketplaceVisible = true`

Business onboarding creates settings by default. Manual or seed-created data must create this relationship explicitly.

### Branch requirements

Each visible business must have at least one `Branch` included by marketplace search:

- `organizationId` points to the organization.
- `deletedAt = null`
- `status = ACTIVE`
- `city` should be set, for example `Baghdad`, so `filters.cities` is non-empty and `?city=Baghdad` can be tested.
- `locationLabel`, address, and/or landmark are recommended for mobile card quality.
- `latitude` and `longitude` are optional for plain list tests, but needed for nearby coordinate smoke tests.

### Service and BranchService requirements for service businesses

For non-restaurant/non-cafe businesses, the marketplace service final filter requires `serviceCount > 0`.

That means each service business must have:

- `Category` row.
- `Service` row with:
  - `organizationId` pointing to the organization.
  - `categoryId` pointing to the category.
  - `status = ACTIVE`.
- `BranchService` row with:
  - `branchId` pointing to an active branch.
  - `serviceId` pointing to an active service.
  - `isAvailable = true`.
  - `price` set.
  - `durationMinutes` set.

### Restaurant/cafe menu/table requirements

For `RESTAURANT` and `CAFE`, the final marketplace filter differs.

The business still needs a public-visible organization and active branch, and it must have at least one of:

- active `RestaurantTable` with `isActive = true`; or
- available `MenuItem` with `isAvailable = true` under a `MenuCategory`.

Restaurant/cafe businesses do not need `serviceCount > 0` to appear in `businesses`.

Important filter nuance:

- `filters.categories` are derived from active `Service` rows, not menu/table rows. A restaurant can appear in `businesses` with tables/menu but no service, while categories may remain empty unless at least one service/category exists elsewhere.

### Category/filter requirements

For `filters.categories.Count >= 1`, staging needs at least one `Category` with at least one active `Service` attached to a public-visible organization.

The migration `prisma/migrations/20260701020000_seed_general_category/migration.sql` inserts only one default category:

- id `00000000-0000-4000-8000-000000000001`
- name `General`
- slug `general`

No standalone staging marketplace seed script was found.

### City/filter requirements

For `filters.cities.Count >= 1`, staging needs at least one active, non-deleted `Branch` with a non-null `city` whose organization satisfies public marketplace settings.

Recommended staging city:

- `Baghdad`

## Minimal test dataset

The minimum useful staging dataset is three businesses:

1. Beauty / Salon
2. Restaurant
3. Clinic / Dental

The records below are intended as a data plan for owner UI setup or a future explicitly approved staging-only seed script. They are not executed in this phase.

### Business A - Beauty / Salon

Suggested business:

- Name: `Noura Beauty Lounge`
- Slug: `noura-beauty-lounge`
- Vertical: `BEAUTY`
- City: `Baghdad`

Required models/tables:

- `Organization`
- `OrganizationSettings`
- `BusinessProfile`
- `Branch`
- `Category`
- `Service`
- `BranchService`

Required fields and enum values:

| Model | Required fields | Why it matters |
| --- | --- | --- |
| `Organization` | `name = Noura Beauty Lounge`, `slug = noura-beauty-lounge`, `vertical = BEAUTY`, `status = ACTIVE`, `isActive = true`, `deletedAt = null` | Satisfies public organization filter and vertical smoke |
| `OrganizationSettings` | `bookingEnabled = true`, `marketplaceVisible = true` | Required by `publicOrganizationWhere` |
| `BusinessProfile` | `businessCategory = Beauty` or Arabic equivalent, optional description/images | Improves `categoryName`, card/detail text |
| `Branch` | `status = ACTIVE`, `deletedAt = null`, `city = Baghdad`, location fields | Required active branch and city filter |
| `Category` | `name = Beauty` or reuse `General`, valid `slug` | Required for `Service.category` |
| `Service` | `status = ACTIVE`, `categoryId`, `organizationId`, name such as `Haircut` | Required for service count and categories |
| `BranchService` | `branchId`, `serviceId`, `isAvailable = true`, `price`, `durationMinutes` | Required for `serviceCount > 0` and starting price |

Optional fields:

- `logoUrl`
- `coverImageUrl`
- branch coordinates
- reviews

### Business B - Restaurant

Suggested business:

- Name: `Mat3am Gold`
- Slug: `mat3am-gold`
- Vertical: `RESTAURANT`
- City: `Baghdad`

Required models/tables:

- `Organization`
- `OrganizationSettings`
- `BusinessProfile`
- `Branch`
- `RestaurantTable` OR `MenuCategory` + `MenuItem`

Recommended for better card coverage:

- Also add a `Category`, `Service`, and `BranchService` if category filters should include restaurant labels.

Required fields and enum values:

| Model | Required fields | Why it matters |
| --- | --- | --- |
| `Organization` | `name = Mat3am Gold`, `slug = mat3am-gold`, `vertical = RESTAURANT`, `status = ACTIVE`, `isActive = true`, `deletedAt = null` | Satisfies public organization filter and `?vertical=RESTAURANT` |
| `OrganizationSettings` | `bookingEnabled = true`, `marketplaceVisible = true` | Required by marketplace public filter |
| `BusinessProfile` | category/description optional | Improves mobile copy |
| `Branch` | `status = ACTIVE`, `deletedAt = null`, `city = Baghdad` | Required active branch and city filter |
| `RestaurantTable` | `businessId`, optional `branchId`, `isActive = true`, `capacity` | Makes restaurant visible through `hasTables` |
| `MenuCategory` | `businessId`, `isActive = true` | Required if menu path is used |
| `MenuItem` | `businessId`, `menuCategoryId`, `isAvailable = true`, `price` | Makes restaurant visible through `hasMenu` |

Optional fields:

- branch coordinates
- cover image
- menu images
- reviews

### Business C - Clinic / Dental

Suggested business:

- Name: `Smile Studio Clinic`
- Slug: `smile-studio-clinic`
- Preferred vertical: `DENTIST`
- Alternate valid vertical: `CLINIC`
- City: `Baghdad`

Required models/tables:

- `Organization`
- `OrganizationSettings`
- `BusinessProfile`
- `Branch`
- `Category`
- `Service`
- `BranchService`

Required fields and enum values:

| Model | Required fields | Why it matters |
| --- | --- | --- |
| `Organization` | `name = Smile Studio Clinic`, `slug = smile-studio-clinic`, `vertical = DENTIST`, `status = ACTIVE`, `isActive = true`, `deletedAt = null` | Satisfies public organization filter and `?vertical=DENTIST` |
| `OrganizationSettings` | `bookingEnabled = true`, `marketplaceVisible = true` | Required by marketplace public filter |
| `BusinessProfile` | `businessCategory = Dental` or Arabic equivalent | Improves category display |
| `Branch` | `status = ACTIVE`, `deletedAt = null`, `city = Baghdad`, location fields | Required active branch and city filter |
| `Category` | `name = Dental` or reuse `General`, valid `slug` | Required for service relation |
| `Service` | `status = ACTIVE`, name such as `Dental Checkup` | Required for service count |
| `BranchService` | `branchId`, `serviceId`, `isAvailable = true`, `price`, `durationMinutes` | Required for visibility and starting price |

Optional fields:

- branch coordinates
- `coverImageUrl`
- reviews

## Preferred setup path - owner UI/admin/onboarding

The safest owner-controlled path is to create/activate the dataset through existing staging UI flows and server actions.

Confirmed route/action evidence:

- `/onboarding/business` renders `BusinessOnboardingForm`.
- `/business/manage/settings` renders `BusinessSettingsPage`.
- `/business/manage/locations` renders `BranchManagementPage`.
- `/business/services` renders `ServiceManagementPage`.
- `/business/public-profile` renders `PublicProfileManagementPage`.
- `/business/menu` renders `RestaurantMenuPage`.
- `/business/tables` renders `RestaurantTablesPage`.

### General owner setup sequence

For each staging business:

1. Log in to staging as owner.
2. Use `/onboarding/business` to create the business if it does not already exist.
   - `completeBusinessOnboarding()` creates `Organization`, initial `Branch`, `BusinessProfile`, `OrganizationSettings`, owner role, and membership.
3. Use `/business/manage/settings` to verify:
   - `vertical`
   - `bookingEnabled`
   - `marketplaceVisible`
4. Use `/business/public-profile` to set:
   - business name/slug if needed
   - category text
   - description/images if desired
   - published/visible state
5. Use `/business/manage/locations` to verify or update:
   - branch status `ACTIVE`
   - city `Baghdad`
   - location label/address
   - coordinates if nearby tests are needed

### Beauty / Salon setup

For `Noura Beauty Lounge`:

1. Create business via `/onboarding/business`.
2. Set vertical to `BEAUTY` in `/business/manage/settings`.
3. Ensure marketplace visibility and booking are enabled.
4. Ensure branch city is `Baghdad` in `/business/manage/locations`.
5. Create at least one service in `/business/services`.
6. Use an active category, such as existing `General`, unless a category management path exists.
7. Attach service to the active branch with price and duration.

Visibility checkpoint:

- The service create action creates `Service` plus related `BranchService` rows for selected active branches.
- That should satisfy the `serviceCount > 0` requirement.

### Restaurant setup

For `Mat3am Gold`:

1. Create business via `/onboarding/business`.
2. Set vertical to `RESTAURANT` in `/business/manage/settings`.
3. Ensure marketplace visibility and booking are enabled.
4. Ensure branch city is `Baghdad`.
5. Use `/business/tables` to create at least one active restaurant table, OR use `/business/menu` to create:
   - active menu category
   - available menu item

Visibility checkpoint:

- `RESTAURANT` is visible if it has an active branch and either `hasTables` or `hasMenu`.
- Category filters may remain empty unless another service-backed business exists or a restaurant service is added.

### Clinic / Dental setup

For `Smile Studio Clinic`:

1. Create business via `/onboarding/business`.
2. Set vertical to `DENTIST` if available in the UI; otherwise use `CLINIC`.
3. Ensure marketplace visibility and booking are enabled.
4. Ensure branch city is `Baghdad`.
5. Create at least one active service in `/business/services`.
6. Attach service to active branch with price and duration.

Visibility checkpoint:

- `DENTIST` or `CLINIC` should appear with `?vertical=DENTIST` or `?vertical=CLINIC` once the active branch service exists.

### UI path uncertainty

The routes and server actions exist in the repo. This plan does not verify the live staging UI state, account permissions, or whether the owner account currently has access to create all three businesses. If the UI blocks multi-business setup or category choice, use Phase 31C to design an owner-approved staging-only script.

## Optional future seed script plan

If UI setup is blocked, Phase 31C can implement a future staging-only seed script. Do not create or run this script in Phase 31B.

Proposed script path:

```text
scripts/staging/seed-marketplace-demo.ts
```

### Required environment safety checks

The script must:

- Abort unless `STAGING_SEED_CONFIRM=REZNO_STAGING_ONLY`.
- Abort unless `NODE_ENV` or an explicit script flag indicates non-production/staging.
- Refuse to run if the database host or URL appears production.
- Log only the target database host/name summary.
- Never print full `DATABASE_URL`.
- Require explicit owner approval before execution.
- Refuse to run during build/deploy hooks.

### Idempotency requirements

The script must be safe to run more than once:

- Upsert organizations by slug.
- Upsert or find branches by `organizationId + slug`.
- Upsert or find categories by slug.
- Upsert or find services by `organizationId + name` or stable slug if added later.
- Upsert branch services by the schema unique key `branchId_serviceId`.
- Upsert restaurant tables by stable name/code.
- Upsert menu categories/items by stable names scoped to business.
- Avoid duplicate organizations, branches, services, menu items, and tables.

### Rollback notes

Prefer reversible soft deactivation over deletion:

- set `Organization.isActive = false` or `Organization.status = INACTIVE`
- set `OrganizationSettings.marketplaceVisible = false`
- set `Branch.status = INACTIVE`
- set `Service.status = INACTIVE`
- set `BranchService.isAvailable = false`
- set `RestaurantTable.isActive = false`
- set `MenuItem.isAvailable = false`

Avoid hard deletes unless separately approved.

### Owner approval gate

The script must not be run without explicit owner approval at the moment of execution. Phase 31C should produce the script and a dry-run/readiness report first, then wait for CTO/owner approval before any staging mutation command.

## Validation after data exists

After owner creates or activates staging data, run:

```powershell
$response = Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?limit=10"
$response.data.businesses.Count
$response.data.filters.categories.Count
$response.data.filters.cities.Count
$response | ConvertTo-Json -Depth 20
```

Expected:

- `businesses.Count >= 1`
- ideally `businesses.Count >= 3`
- `filters.categories.Count >= 1`
- `filters.cities.Count >= 1`

Also test valid vertical filters:

```powershell
(Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?vertical=BEAUTY&limit=10").data.businesses.Count
(Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?vertical=RESTAURANT&limit=10").data.businesses.Count
(Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?vertical=DENTIST&limit=10").data.businesses.Count
(Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?vertical=CLINIC&limit=10").data.businesses.Count
(Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?city=Baghdad&limit=10").data.businesses.Count
```

Expected:

- `BEAUTY >= 1`
- `RESTAURANT >= 1`
- `DENTIST >= 1` if Smile Studio uses `DENTIST`; otherwise `CLINIC >= 1`
- `city=Baghdad >= 1`, ideally `>= 3`

Because the endpoint sends a short public cache header, allow for a brief cache delay after staging data changes before treating a result as final.

## PR #85 retest plan

After staging data exists:

1. Check out PR #85 branch:

   ```powershell
   git fetch origin
   git checkout mobile-phase-31-read-only-business-discovery
   git reset --hard origin/mobile-phase-31-read-only-business-discovery
   ```

2. Start mobile Metro/dev-client with staging API:

   ```powershell
   cd apps/mobile
   $env:EXPO_PUBLIC_REZNO_API_BASE_URL = "https://rezno-staging.vercel.app"
   npx.cmd expo start --dev-client --lan --clear
   ```

3. Open the Android development build.
4. Verify Home shows API business cards.
5. Verify Search Map shows API result cards.
6. Tap Home business card -> Salon Detail opens.
7. Tap Search Map result -> Salon Detail opens.
8. Verify no crash or red screen.
9. Verify empty/error/retry states still work if API is unavailable or forced empty in a safe test context.

Do not create bookings, payments, favorites, messages, notifications, or auth flows during this PR #85 smoke unless a later gate explicitly approves them.

## Decision guidance for PR #85

PR #85 can be approved only when one of these is true:

### A. Preferred

Staging has visible businesses and the API success-with-data path passes mobile smoke:

- endpoint returns at least one business;
- Home renders API-backed cards;
- Search Map renders API-backed cards;
- business card handoff opens Salon Detail;
- no red screen or runtime crash.

### B. CTO exception, not preferred

CTO explicitly approves merging with empty-state-only behavior verified.

Current recommendation:

> Hold PR #85 until the minimal staging dataset exists and success-with-data smoke passes.

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Accidental production data mutation | Severe production contamination | Use UI against staging only; future script must refuse production-like DB targets |
| Duplicate staging data | Noisy QA results and confusing cards | Use stable slugs/names; future script must be idempotent |
| Partial or invisible business setup | Endpoint still returns empty | Verify settings, active branch, service/table/menu requirements |
| Enum mismatch | Vertical filter smoke fails | Use schema-valid enum values: `BEAUTY`, `RESTAURANT`, `DENTIST` or `CLINIC` |
| Missing branch service relationships | Service businesses filtered out | Ensure `BranchService` exists and `isAvailable = true` |
| Restaurant visible without categories | Business appears but category filters remain sparse | Ensure at least service-backed businesses exist; optional restaurant service if needed |
| Auth/owner role issues in UI path | Owner cannot create or edit required records | Use owner/admin account or move to Phase 31C seed plan |
| Future seed script risk | Data mutation path can be dangerous | Add hard environment checks, confirmation token, and dry-run/readiness gate |
| Staging API cache delay | Fresh data may not appear instantly | Wait and retry after `Cache-Control` window |
| PR #85 false-negative if data missing | Mobile code may look broken despite empty staging DB | Retest endpoint counts before mobile smoke |

## Safety confirmations

Confirmed for Phase 31B:

- No database mutation.
- No seed executed.
- No migration.
- No schema change.
- No backend endpoint change.
- No mobile code change.
- No package change.
- No deployment or EAS action.
- No production data touch.
- No secrets printed.

## Recommended next action

Recommended next action:

**Owner creates minimal staging marketplace data using existing UI/admin path, then retests `/api/mobile/marketplace`.**

If UI path is blocked:

**Backend/API Phase 31C - Implement Owner-Approved Staging Marketplace Seed Script**

If data appears:

**Resume PR #85 visual/dev-client smoke and decide merge.**
