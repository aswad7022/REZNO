# Mobile Phase 28 — Android EAS Development Build / Real-Device Smoke Preparation

## Status

**BUILD SUCCEEDED / DEVELOPMENT BUILD SMOKE PASSED ON BLUESTACKS / PHYSICAL DEVICE SMOKE NOT RUN**

The Android EAS development build finished successfully. The owner installed/opened the Android development build in BlueStacks / Android emulator and connected it to Metro dev-client.

This confirms development-build runtime smoke at the BlueStacks / Android emulator level only. Physical Android phone smoke remains **NOT RUN** until the owner confirms installation and testing on a real phone.

## EAS login evidence

- `npx.cmd eas-cli whoami` returned `alhakeem7`.
- The expected account email was shown locally.
- No tokens or secrets were printed.

## Project readiness evidence

Repository configuration inspected:

- Mobile app path: `apps/mobile`.
- Expo SDK: `~57.0.2`.
- `expo-dev-client`: present.
- `apps/mobile/eas.json`: present.
- Development profile: present.
- Development profile `developmentClient`: `true`.
- Development profile distribution: `internal`.
- Development profile environment binding: `development`.
- Android package: `com.rezno.mobile`.
- iOS bundle identifier: `com.rezno.mobile`.
- Scheme: `rezno`.
- EAS project: `@alhakeem7/rezno-mobile`.
- EAS project ID: `ef209c9c-0d04-4731-a998-6241fef1b29d`.
- API base URL priority in `apps/mobile/src/config/api.ts`:
  1. `EXPO_PUBLIC_REZNO_API_BASE_URL`
  2. `app.json` `extra.apiBaseUrl`
  3. localhost fallback

Previous readiness blocker, resolved by owner:

- `npx.cmd eas-cli env:list development --format long` failed with: `EAS project not configured. Must configure EAS project by running 'eas init' before this command can be run in non-interactive mode.`
- Owner ran `npx.cmd eas-cli init`, creating and linking `@alhakeem7/rezno-mobile`.
- `apps/mobile/app.json` now records the EAS project link.

## Intended API base URL

Intended Android development build API base URL:

```text
https://rezno-staging.vercel.app
```

Environment verification:

- Owner created `EXPO_PUBLIC_REZNO_API_BASE_URL` in the EAS development environment with value `https://rezno-staging.vercel.app`.
- Owner verified `npx.cmd eas-cli env:list development` showed `EXPO_PUBLIC_REZNO_API_BASE_URL=https://rezno-staging.vercel.app`.
- `apps/mobile/eas.json` now binds the development build profile to the EAS `development` environment.

Result:

- The Android development build was started using the EAS development profile and development environment.

## Validation results

Pre-build validation passed:

- `cd apps/mobile && npm.cmd run typecheck` — passed.
- `cd apps/mobile && npx.cmd expo config --type public` — passed.
- `npm.cmd run lint` — passed.
- `npx.cmd tsc --noEmit` — passed.
- `git diff --check` — passed.
- `git diff --cached --check` — passed.

`tsconfig.tsbuildinfo` was modified by TypeScript and restored as a generated artifact.

## Build command

Executed command:

```powershell
cd apps/mobile
npx.cmd eas-cli build --platform android --profile development --message "Mobile Phase 28B Android development build for real-device smoke"
```

The local command exceeded the local command timeout while the remote EAS build was queued. Follow-up `build:list` / `build:view` commands confirmed that the remote build was created. A later `build:view` check confirmed the build finished successfully.

## Build evidence

- Build URL: `https://expo.dev/accounts/alhakeem7/projects/rezno-mobile/builds/6d6e2cb3-01ee-4d55-a2ec-df3735005312`.
- Build ID: `6d6e2cb3-01ee-4d55-a2ec-df3735005312`.
- Platform: Android.
- Profile: `development`.
- Environment: `development`.
- Distribution: `internal`.
- SDK Version: `57.0.0`.
- Version: `1.0.0`.
- Version code: `1`.
- Commit: `46ca605c98dd01749834f8f6adae76f64768c11b`.
- Started by: `alhakeem7`.
- Started at: `7/7/2026, 2:15:32 PM`.
- Finished at: `7/7/2026, 2:38:13 PM`.
- Status: `finished`.
- APK artifact URL: `https://expo.dev/artifacts/eas/_YirV6Q5TWn3599Ha1ucR8Qj2noPoJUg_VMt_Kwliy8.apk`.

## Development build install/runtime evidence

Owner-side evidence:

- Owner opened the installed Android development build in BlueStacks / Android emulator.
- Development client screen appeared.
- Metro dev-client server was started with:

  ```powershell
  cd apps/mobile
  $env:EXPO_PUBLIC_REZNO_API_BASE_URL="https://rezno-staging.vercel.app"
  npx.cmd expo start --dev-client --lan --clear
  ```

- Metro URL observed: `exp+rezno-mobile://expo-development-client/?url=http%3A%2F%2F192.168.1.165%3A8081`.
- Development build initially failed to connect to old IP `192.168.1.103:8081`.
- Development build succeeded after connecting to current Metro IP `192.168.1.165:8081`.
- App opened after the correct Metro connection.

## Smoke checklist result

Passed for BlueStacks / Android emulator development build:

- App opens without red screen.
- Dark theme loads.
- Home appears.
- Category icons appear.
- Arabic fonts appear.
- Bottom nav works.
- Favorites opens.
- Account opens.
- Quick booking opens.
- Salon Detail opens.
- Staff Selection opens.
- Date/Time opens.
- Payment opens.
- Confirmation opens.
- Confirmation summary appears.
- My Bookings opens.
- Booking Detail opens.
- No crash observed.
- No Metro error after the correct IP was used.

## Known visual debt

Deferred visual debt remains:

- UI still needs full production visual polish.
- Some RTL/card/detail compositions still need final polish.
- Placeholder media still needs real imagery.
- Current state is acceptable for development readiness, not production UI approval.

Later Phase 29A visual polish was reviewed through this development build / dev-client path and is documented in [mobile-phase-29b-visual-polish-checkpoint.md](./mobile-phase-29b-visual-polish-checkpoint.md).

## Real-device smoke

- BlueStacks / Android emulator development build smoke: **PASSED**.
- Physical Android phone smoke: **NOT RUN** unless the owner later confirms real phone installation and testing.
- Owner install readiness for real Android phone: APK artifact exists and can be used for a future physical-device smoke.

For physical Android phone smoke, the owner-side test path should be:

1. Install the Android development build from the APK artifact URL.
2. Start dev-client Metro:

   ```powershell
   cd apps/mobile
   $env:EXPO_PUBLIC_REZNO_API_BASE_URL="https://rezno-staging.vercel.app"
   npx.cmd expo start --dev-client --lan --clear
   ```

3. Open the installed REZNO development build.
4. Connect to the local dev server if prompted.
5. Smoke test:
   - App opens without red screen.
   - Dark theme loads.
   - Home appears.
   - Category icons appear.
   - Arabic fonts appear.
   - Bottom nav works.
   - Salon Detail opens.
   - Visual booking flow opens: Staff -> Date/Time -> Payment -> Confirmation.
   - Confirmation -> View Booking works.
   - My Bookings opens.
   - Booking Detail opens.
   - No CTA hidden behind bottom nav.
   - Staging API path does not break app shell.
6. Record screenshots and pass/fail notes.

Do not mark real-device smoke complete until the owner confirms installation and test results.

## Release readiness

**NOT PRODUCTION RELEASE READY**

Production readiness requires physical-device smoke and future release-specific validation. This development-build smoke supports development readiness only.

## Safety confirmations

- No iOS build was run.
- No production build was run.
- No preview build was run.
- Android development build only was started.
- No Expo publish/update was run.
- No EAS Update was run.
- No EAS Submit was run.
- No TestFlight upload was run.
- No runtime code changed.
- No mobile UI changed.
- No API, auth, database, schema, Prisma, migration, booking, or payment behavior changed.
- No package files changed.
- EAS config change was limited to binding the development profile to the EAS `development` environment.

## Recommended next action

Recommended next action:

**Mobile Visual Polish Phase — Full Figma Fidelity and Production UI Polish**

Alternative:

**Physical Android Phone Smoke — Install APK on real Android device and repeat the checklist**

Decision recommendation:

**NEEDS QA GATE BEFORE RELEASE**

Reason:

- EAS login is available.
- EAS project is linked.
- EAS development environment binding is configured.
- Android EAS development build succeeded.
- BlueStacks / Android emulator development-build smoke passed.
- Physical phone smoke remains not run.
- Release readiness still requires a QA gate before production.
