# Cloud Staging Setup for Web and Mobile API

This document records the staging deployment plan for the REZNO web/API app and
the Expo mobile app foundation. It is operational documentation only. It does
not create secrets, schema changes, migrations, or hosting resources.

## Goals

- Deploy the existing Next.js app as the staging web/API service.
- Provide a managed PostgreSQL database for staging.
- Configure Better Auth with staging-safe URLs and secrets.
- Point the Expo mobile app at the staging API without changing backend auth.
- Keep the isolated Expo app under `apps/mobile` out of the root web build.

## Recommended staging providers

- Web/API hosting: Vercel.
- Database: Neon PostgreSQL or an equivalent managed PostgreSQL provider.
- Mobile builds: Expo/EAS later, after mobile authentication and API
  integration are approved.

## Repository readiness

- The root app remains the Next.js web/API deployment.
- The Expo app remains isolated under `apps/mobile`.
- Mobile dependencies remain inside `apps/mobile/package.json` and
  `apps/mobile/package-lock.json`.
- The root `tsconfig.json` excludes `apps/mobile` so the Vercel root web build
  does not type-check Expo-only files or require Expo dependencies at the root.
- Prisma uses `DATABASE_URL` through `prisma.config.ts` and
  `lib/db/prisma.ts`.
- Better Auth uses:
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - trusted origins derived from `BETTER_AUTH_URL`
- Root admin bootstrap uses `REZNO_ADMIN_EMAILS`.

## Required environment variables

Set these in the staging web/API hosting environment:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Managed PostgreSQL connection string for staging. |
| `BETTER_AUTH_SECRET` | Yes | Strong random secret. Never reuse local or development secrets. |
| `BETTER_AUTH_URL` | Yes | Public staging web/API origin, such as the Vercel staging URL or custom staging domain. |
| `REZNO_ADMIN_EMAILS` | Yes | Comma-separated root Super Admin emails for staging only. |

Set this for local Expo testing against staging or future EAS profiles:

| Variable | Required | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_REZNO_API_BASE_URL` | Optional now | Public staging web/API origin used by the Expo app foundation. This is not a secret. |

Do not commit real values for any secret. Do not commit `.env` files.

## Better Auth staging checklist

1. Generate a staging-only `BETTER_AUTH_SECRET`.
2. Set `BETTER_AUTH_URL` to the exact staging origin.
3. Ensure the staging domain used by browsers and mobile API testing matches
   `BETTER_AUTH_URL`.
4. Do not use the default Better Auth secret in staging.
5. Keep production and staging auth secrets separate.

## Database staging checklist

1. Create a managed PostgreSQL staging database.
2. Store the staging `DATABASE_URL` in the hosting provider environment
   variable settings.
3. Run migrations against staging using:

   ```powershell
   npx.cmd prisma migrate deploy
   ```

4. Verify status after deployment:

   ```powershell
   npx.cmd prisma migrate status
   ```

5. Do not run destructive reset commands against staging.

## Vercel staging checklist

1. Connect the GitHub repository to the Vercel project.
2. Use the root project as the Vercel root directory.
3. Keep the install and build flow as the web app flow:
   - install root dependencies
   - run root `npm run build`
4. Configure the required environment variables in the Vercel staging
   environment.
5. Confirm Vercel does not attempt to build `apps/mobile` as a separate app in
   this sprint.
6. Verify preview deployment logs show the root Next.js build completing.

## Mobile API configuration

The Expo app reads its API base URL from:

1. `EXPO_PUBLIC_REZNO_API_BASE_URL`, when provided.
2. `apps/mobile/app.json` `extra.apiBaseUrl` fallback.
3. `http://localhost:3000` fallback in `apps/mobile/src/config/api.ts`.

For staging mobile testing, set:

```powershell
$env:EXPO_PUBLIC_REZNO_API_BASE_URL="https://your-staging-origin.example"
```

Then run the Expo app from `apps/mobile`.

Mobile authentication is intentionally not integrated in this sprint. Better
Auth mobile and session integration requires a separate approved backend/auth
sprint.

## Deployment sequence

1. Confirm the main branch commit intended for staging.
2. Provision or select the staging PostgreSQL database.
3. Add required environment variables in Vercel.
4. Deploy the web/API app.
5. Run `npx.cmd prisma migrate deploy` against the staging database if the
   deploy process does not already run migrations.
6. Verify web routes and auth flows on staging.
7. Configure `EXPO_PUBLIC_REZNO_API_BASE_URL` for mobile testing against
   staging.
8. Run Expo mobile smoke testing against the staging API boundary.

## Rollback plan

- Web/API: redeploy the previous known-good Vercel deployment or revert the
  GitHub commit and redeploy.
- Database: prefer forward fixes. If a migration causes staging-only issues,
  restore from a managed database backup or snapshot rather than running
  destructive reset commands.
- Mobile: point `EXPO_PUBLIC_REZNO_API_BASE_URL` back to the previous
  known-good staging API origin.

## Manual account steps required

The human owner must provide or configure:

- Vercel project access.
- Managed PostgreSQL staging database.
- Staging `DATABASE_URL`.
- Staging `BETTER_AUTH_SECRET`.
- Staging `BETTER_AUTH_URL`.
- Staging `REZNO_ADMIN_EMAILS`.
- Optional staging custom domain.
- Optional Expo/EAS account configuration for future native builds.

Codex must not create cloud resources or handle real secrets without explicit
owner approval.
