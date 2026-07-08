# Backend/API Phase 31C - Owner-Approved Minimal Staging Marketplace Seed

## Status

**STAGING DB ACCESS BLOCKED / SEED SCRIPT CREATED / NO DATA MUTATION EXECUTED**

This phase adds an owner-approved staging-only seed script for the minimal marketplace dataset needed by Mobile Phase 31 / PR #85.

The seed was not executed during this implementation because the local process did not have:

- `DATABASE_URL`
- `STAGING_SEED_CONFIRM=REZNO_STAGING_ONLY`

No staging database was mutated. No production database was touched. No migrations, schema changes, endpoint behavior changes, mobile runtime changes, package installs, deployment, EAS action, or Expo publish/update were performed.

## Why this phase exists

PR #85 is currently on hold because the public staging endpoint is reachable but returns an empty marketplace payload:

- `businesses: []`
- `filters.categories: []`
- `filters.cities: []`
- business count `0`

Phase 31B found that staging likely lacks public-visible marketplace records satisfying the existing marketplace visibility rules. Phase 31C provides a guarded, idempotent script for creating the minimal staging dataset once the owner provides staging database access in a secure execution context.

## Script path

```text
scripts/staging/seed-marketplace-demo.ts
```

Root package script:

```text
npm run seed:staging:marketplace-demo
```

The package script uses the existing repo `tsx` dev dependency. No dependency was added and the lockfile was not changed.

## Safety gates

The script exits before connecting to the database unless all required gates pass:

1. `DATABASE_URL` must exist in the current process.
2. `STAGING_SEED_CONFIRM` must exactly equal:

   ```text
   REZNO_STAGING_ONLY
   ```

3. `DATABASE_URL` must parse as a PostgreSQL URL.
4. The target database fingerprint must contain an explicit staging marker:

   - `staging`
   - or `stage`

5. The target database fingerprint must not contain production-like markers:

   - `production`
   - `prod`
   - `live`

6. The script logs only a safe target summary:

   - host
   - database name

It does not print the full `DATABASE_URL`, password, token, or connection string.

## Dataset created when executed

The script is idempotent and creates or updates three staging demo businesses by stable slug.

### 1. Beauty / Salon

- Organization: `Noura Beauty Lounge`
- Slug: `noura-beauty-lounge`
- Vertical: `BEAUTY`
- Branch city: `Baghdad`
- Category: `صالونات`
- Category slug: `beauty`
- Service: `قص شعر`
- Branch service price: `250.00`
- Branch service duration: `30` minutes

Visibility purpose:

- Public organization
- Public settings
- Active branch
- Active service
- Available branch service
- Category and city filters

### 2. Restaurant

- Organization: `Mat3am Gold`
- Slug: `mat3am-gold`
- Vertical: `RESTAURANT`
- Branch city: `Baghdad`
- Category: `مطاعم`
- Category slug: `restaurant`
- Service: `حجز طاولة`
- Branch service price: `800.00`
- Active restaurant table
- Active menu category
- Available menu item

Visibility purpose:

- Public organization
- Public settings
- Active branch
- Restaurant visibility through active table/menu
- Optional service-backed category filter coverage

### 3. Dental / Clinic

- Organization: `Smile Studio Clinic`
- Slug: `smile-studio-clinic`
- Vertical: `DENTIST`
- Branch city: `Baghdad`
- Category: `عيادات`
- Category slug: `dental`
- Service: `فحص أسنان`
- Branch service price: `500.00`
- Branch service duration: `45` minutes

Visibility purpose:

- Public organization
- Public settings
- Active branch
- Active service
- Available branch service
- Category and city filters

## Idempotency behavior

The script avoids duplicate staging records by using stable identifiers:

- Organizations are upserted by `slug`.
- Organization settings are upserted by `organizationId`.
- Business profiles are upserted by `organizationId`.
- Branches are upserted by `organizationId + slug`.
- Categories are upserted by `slug`.
- Services are found or created by `organizationId + name`.
- Branch services are upserted by `branchId + serviceId`.
- Restaurant tables are found or created by `businessId + branchId + name`.
- Menu categories are found or created by `businessId + name`.
- Menu items are found or created by `businessId + menuCategoryId + name`.

The script does not hard-delete data and does not run destructive commands.

## Execution blocker in this implementation

The implementation environment did not expose the staging `DATABASE_URL`, and the confirmation variable was not set.

Current blocker:

```text
STAGING DB ACCESS BLOCKER
```

Required owner-side secure execution context:

```powershell
$env:DATABASE_URL = "<owner enters rotated Neon staging URL directly in terminal>"
$env:STAGING_SEED_CONFIRM = "REZNO_STAGING_ONLY"
npm.cmd run seed:staging:marketplace-demo
Remove-Item Env:DATABASE_URL
Remove-Item Env:STAGING_SEED_CONFIRM
```

The full database URL must not be pasted into chat, committed to files, printed in logs, or stored.

## Endpoint validation after owner execution

After the script runs successfully against staging, validate:

```powershell
$response = Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?limit=10"
$response.data.businesses.Count
$response.data.filters.categories.Count
$response.data.filters.cities.Count
```

Expected result:

- `businesses.Count >= 3`
- `filters.categories.Count >= 1`
- `filters.cities.Count >= 1`

Recommended vertical checks:

```powershell
(Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?vertical=BEAUTY&limit=10").data.businesses.Count
(Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?vertical=RESTAURANT&limit=10").data.businesses.Count
(Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?vertical=DENTIST&limit=10").data.businesses.Count
(Invoke-RestMethod "https://rezno-staging.vercel.app/api/mobile/marketplace?city=Baghdad&limit=10").data.businesses.Count
```

Expected:

- `BEAUTY >= 1`
- `RESTAURANT >= 1`
- `DENTIST >= 1`
- `city=Baghdad >= 3`

Allow for the endpoint's short public cache window before treating a fresh empty response as final.

## PR #85 retest readiness

PR #85 should remain on hold until one of these is true:

1. The owner executes the staging seed successfully and endpoint validation returns visible businesses.
2. CTO explicitly approves merging PR #85 with empty-state-only behavior.

Preferred next step:

**Execute this seed against the rotated Neon staging database using the secure owner-side environment variables, then retest PR #85 with real marketplace data.**

## Safety confirmations

Confirmed for this implementation:

- No seed was executed.
- No database mutation was performed.
- No production database was touched.
- No Prisma schema change.
- No migration created or edited.
- No destructive database command.
- No backend endpoint behavior change.
- No mobile runtime code change.
- No auth, permissions, booking, payment, or business logic change.
- No deployment, EAS build, EAS submit, Expo publish/update, or production build.
- No full `DATABASE_URL` was printed or stored.
- No secrets were committed.

## Decision

**READY FOR OWNER STAGING EXECUTION GATE / PR #85 STILL ON HOLD**

The seed implementation is ready for review, but staging data does not exist yet from this phase because secure database access was not available in the local process.
