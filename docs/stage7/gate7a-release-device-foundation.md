# Gate 7A — Release and Physical-Device Foundation

Status: **AUTHOR IMPLEMENTATION COMPLETE — EXTERNAL BUILD NOT RUN**.

Base: `7b5fd511bdb8b7fa7968b233ad5f36cdd346d2b6`.

This gate prepares a deterministic Development/Preview device path. It does
not create an EAS build, publish an update, submit to TestFlight or Google
Play, change staging/production, or claim physical-device success.

## Locked release contract

| Setting | Canonical value |
| --- | --- |
| Expo owner/project | `@alhakeem7/rezno-mobile` |
| EAS project ID | `ef209c9c-0d04-4731-a998-6241fef1b29d` |
| iOS bundle identifier | `com.rezno.mobile` |
| Android package | `com.rezno.mobile` |
| App scheme | `rezno` |
| Development profile | development client / internal / `development` |
| Preview profile | standalone / internal / `preview` |
| Production profile | store / `production` |
| Mobile staging API origin | `https://rezno-staging.vercel.app` |

`npm run validate:release-config --prefix apps/mobile` validates these values
directly from `app.json` and `eas.json`. It also requires
`expo-secure-store`, locks Development/Preview to staging, prevents Preview
from becoming a development client, and prevents the production profile from
embedding the staging origin. It also locks `react-dom` to the React version
and requires the Expo-compatible `react-native-web` runtime so the declared
Web target cannot silently regress.

The production API origin must be separately approved and configured in the
EAS `production` environment. Gate 7A does not invent or configure it.

## Staging alias truth

Read-only Vercel and HTTP evidence on 2026-07-25 proved:

- `https://rezno-staging.vercel.app` and
  `https://rezno-staging-rafidedu.vercel.app` resolve to deployment
  `dpl_25GcX8iqWBZe3czYqQpkynwoht7R`;
- that deployment is `READY`, targets staging project `rafidedu/rezno-staging`,
  and was built from merge SHA
  `7b5fd511bdb8b7fa7968b233ad5f36cdd346d2b6`;
- the first alias returns HTTP 200 for
  `/api/auth/get-session` without a Vercel team session;
- the second alias returns Vercel protection HTTP 302 to an unauthenticated
  device.

The public alias is therefore the canonical Mobile staging origin. A mobile
bundle must never embed a Vercel protection bypass token.

## Runtime API-origin guard

A non-development bundle:

- requires `EXPO_PUBLIC_REZNO_API_BASE_URL`;
- accepts HTTPS only;
- rejects localhost, `.localhost`, `.local`, `.internal`, `.lan`, single-label
  hosts, IPv4 literals, and IPv6 literals;
- rejects credentials, path, query, fragment, and non-standard HTTPS ports;
- normalizes the accepted value to its exact origin.

Development without configuration may still use `http://localhost:3000`.
Physical-device Development and every EAS profile set the staging origin
explicitly because device-local `localhost` is not the developer computer.

## Repository preflight

From the Stage 7 worktree:

```bash
npm ci
npm ci --prefix apps/mobile
npm run test:stage7a
npm run typecheck --prefix apps/mobile
npm run validate:release-config --prefix apps/mobile
cd apps/mobile
npx --no-install expo config --type public --json
npx --no-install expo install --check
cd ../..
```

Then run root TypeScript, ESLint, Prisma validation, Next.js production build,
Expo Doctor, and iOS/Android Hermes exports as defined in the Gate 7A test
plan. Generated native `ios/` and `android/` directories must not be committed.

## EAS access check

The safe read-only access check is:

```bash
cd apps/mobile
npx eas-cli whoami
npx eas-cli project:info
npx eas-cli config --platform android --profile development --non-interactive
npx eas-cli config --platform ios --profile preview --non-interactive
```

Do not run credential-management commands, print `EXPO_TOKEN`, list signing
material, or include sensitive environment values in evidence. Gate 7A
confirmed account/project access only.

The EAS Development environment currently also defines
`EXPO_PUBLIC_REZNO_API_BASE_URL`; the tracked Development profile defines the
same public setting and takes precedence. The Preview environment has no
server-side copy and uses the tracked profile value. The Production
environment has no approved API origin, so a Production release remains
blocked and fail-closed.

## Authorized future build commands

These are runbook commands, not evidence that a build ran. Execute only after
the owner separately authorizes consumption of EAS build resources.

```bash
cd apps/mobile
npx eas-cli build --platform android --profile development
npx eas-cli build --platform ios --profile development
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile preview
```

Development includes the dev client and requires Metro:

```bash
EXPO_PUBLIC_REZNO_API_BASE_URL=https://rezno-staging.vercel.app \
  npx expo start --dev-client --lan --clear
```

Preview is standalone and does not require Metro. Do not run
`eas submit`, `--auto-submit`, `eas update`, or a Production build under this
Gate 7A authorization.

## Install and open

### Android

1. Use the Development or Preview internal APK from the exact Stage 7 commit.
2. Verify the artifact belongs to `com.rezno.mobile`.
3. Install through the EAS internal link or `adb install -r`.
4. Open without exposing the device serial in shared evidence.
5. Confirm the in-app API origin is
   `https://rezno-staging.vercel.app`.

### iPhone

1. Register the physical device through the approved EAS/Apple path.
2. Create a new internal build after the device is included in provisioning.
3. Verify the artifact belongs to `com.rezno.mobile`.
4. Install from the EAS internal link and open it.
5. Development requires Metro; Preview does not.

No TestFlight upload belongs to Gate 7A.

## Author verification evidence

Repository verification completed on 2026-07-25 from a clean dependency
installation:

- Gate 7A focused tests: 10/10 passed, 0 skipped, 0 todo;
- all Unit tests: 470/470 passed, 0 skipped, 0 todo;
- root and Mobile TypeScript, ESLint, and `git diff --check`: passed;
- Prisma validation and client generation: passed;
- Next.js production build: passed, including 115/115 static-generation
  entries;
- Expo dependency validation: passed;
- Expo Doctor: 20/20 passed;
- iOS and Android Hermes exports: passed at 3.1 MB each;
- Expo Web export: passed at 1.9 MB;
- root production dependency audit: 0 vulnerabilities;
- Mobile full dependency audit: 0 vulnerabilities;
- root full audit: 12 inherited development-only findings
  (3 moderate, 9 high, 0 critical); the root lockfile is unchanged by Gate 7A;
- migrations: 49 total, with no schema or migration change.

Migration 48 remains
`04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192`.
Migration 49 remains
`6cd6ec39cc950600002f0b36529ea08460c539b8ced0176f37fbed2980a74f0c`.

Authenticated EAS account/project and resolved profile access succeeded.
No EAS build, update, submission, credential-management operation, store
action, or physical-device run was performed.

## Launch smoke

For both platforms record:

- exact Git SHA and EAS build ID;
- platform, device model, and OS version without UDID/serial;
- build profile and API origin;
- install result, first launch, second launch, background/foreground, and
  force-close/reopen;
- Arabic, English, Kurdish, RTL/LTR, light/dark;
- sign-in/session restoration and explicit logout;
- sanitized visible failure and network status.

Do not claim Camera, HEIC, hosted payment, deep-link return, push, or provider
receipt success in Gate 7A.

## Evidence template

```text
Date/time and timezone:
Tester:
Commit SHA:
Platform/device model:
OS version:
EAS build ID:
Profile: development / preview
Artifact visibility: internal
Package/bundle identifier:
API origin:
Install: PASS / FAIL
First launch: PASS / FAIL
Force-close/reopen: PASS / FAIL
Session restoration: PASS / FAIL
ar/en/ckb and RTL/LTR: PASS / FAIL
Light/dark: PASS / FAIL
Sanitized screenshot/video names:
First failure and reproduction:
Final result: PASS / FAIL
```

Never record passwords, cookies, authorization headers, email/phone values,
device UDIDs/serials, signing material, database URLs, provider tokens, or
private artifact URLs.

## External references

- [EAS build profiles](https://docs.expo.dev/build/eas-json/)
- [EAS environments](https://docs.expo.dev/eas/environment-variables/usage/)
- [Internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Expo environment variables](https://docs.expo.dev/guides/environment-variables/)
