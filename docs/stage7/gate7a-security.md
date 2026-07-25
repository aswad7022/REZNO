# Gate 7A Security Review

Status: **AUTHOR SECURITY REVIEW COMPLETE**.

## Threat and control matrix

| Threat | Gate 7A control |
| --- | --- |
| Release silently targets localhost | Non-development bundles require an explicit public HTTPS origin; localhost, local suffixes, IP literals, and single-label hosts are rejected. |
| Embedded URL contains credentials or attacker-controlled suffixes | API base must be an origin only, with no username, password, path, query, or fragment. |
| Preview accidentally uses Production configuration | Static validator binds each profile to its exact EAS environment and distribution. |
| Production accidentally uses staging | The tracked Production profile cannot contain the staging API origin; the separately approved EAS Production environment must supply its own value. |
| Build identity drift | Project ID, owner, slug, scheme, iOS bundle ID, and Android package are exact tested constants. |
| Declared Web target silently fails | Expo-compatible Web dependencies are explicit, audited, and locked by the Gate 7A validator. |
| Protected Vercel bypass token enters Mobile | Mobile uses the public alias of the exact staging deployment; no bypass token is accepted or documented. |
| Public Mobile variable mistaken for a secret | Only the public API origin uses `EXPO_PUBLIC_`; server secrets and signing material are prohibited. |
| Signing or EAS credential disclosure | Access checks read account/project identity only. Token values, credential inventory, certificates, keystores, and provisioning material are not printed. |
| Unproven physical/store result | Every external build/device/store row is explicit `NOT_RUN` or `BLOCKED`; historical artifacts cannot satisfy Stage 7 evidence. |
| Stage 7 expands into provider/financial activation | Gate 7A creates no build, submission, payment success, provider configuration, receipt, device token, or Stage 6 runtime change. |

## Data and log policy

Allowed shared evidence:

- Git SHA, PR, EAS build ID, profile, public API origin;
- device model and OS version;
- package/bundle identifier;
- sanitized pass/fail status and screenshot filename.

Forbidden shared evidence:

- passwords, session cookies, authorization headers, and account contact data;
- Expo tokens, Apple keys/certificates, provisioning profiles, Android
  keystores/passwords, private artifact URLs, and device UDIDs/serials;
- database URLs, Better Auth secrets, provider credentials, and raw provider
  responses.

`EXPO_PUBLIC_REZNO_API_BASE_URL` is public client configuration. No value
prefixed `EXPO_PUBLIC_` may be treated as secret.

## Dependency and provider boundary

Gate 7A adds only Expo's compatible `react-dom` and `react-native-web`
dependencies to restore the already-declared Web target. It adds no native
plugin. Camera, HEIC conversion, hosted payment, deep-link handlers,
notifications, APNs/FCM, and receipt processing remain unchanged and assigned
to later gates.

The current EAS session proves project access only. It is not evidence of Apple
or Google signing authorization, store access, a successful build, or device
installation.

## Stage 6 and production boundary

Stage 6 remains:

`DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`

Gate 7A does not rotate `BETTER_AUTH_SECRET`, set
`REZNO_PLATFORM_RUNTIME_URL`, initialize runtime control, enable schedules,
change Vercel, mutate GitHub variables, connect to staging PostgreSQL, or touch
production.

The author diff review, generated bundles, dependency audits, and migration
checksums found no Gate 7A P0/P1/P2. Exact-head CI remains a separate Draft PR
publication check. The root full audit retains 12 inherited development-only
findings (3 moderate, 9 high, 0 critical); Gate 7A does not change the root
lockfile, while the root production and Mobile full audits both report zero
vulnerabilities.
