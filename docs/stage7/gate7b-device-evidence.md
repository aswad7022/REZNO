# Gate 7B Device Evidence

Status: **LOCAL IOS SIMULATOR BUILD/INSTALL/OPEN COMPLETE — PHYSICAL NOT RUN**.

No physical-device, EAS build, store, or production result may be inferred
from repository tests or Expo exports.

The local iOS result was produced from Mobile implementation commit
`f7c2ef673d5fbcea185646277723e290581910ff`.

## Safe local evidence matrix

| Check | iOS simulator | Android emulator | Physical iPhone | Physical Android |
| --- | --- | --- | --- | --- |
| Final Mobile source build/install/open | `PASS_LOCAL — native Debug build, 0 errors, installed and opened; generated state cleaned` | `BLOCKED_LOCAL_TOOLING — Android SDK/adb unavailable` | `NOT_RUN` | `NOT_RUN` |
| Camera permission/cancel/capture | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Library permission/cancel/select | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| HEIC/HEIF normalization | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Offline/slow/timeout/retry | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Progress and cancellation | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Force-close/reopen recovery | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| Cross-account/destination fail-closed | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |
| `ar`/`en`/`ckb`, RTL/LTR | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` | `NOT_RUN` |

The iOS result proves native prebuild, CocoaPods integration, compile, install,
and Development Client open only. It does not prove authenticated UI,
camera/library behavior, HEIC decoding, poor-network recovery, process death,
or physical hardware. Two generated-project warnings were non-blocking:
duplicate `-lc++` and an Expo Dev Launcher build phase without explicit
outputs. No EAS build was consumed. Authenticated read-only EAS account and
project access succeeded.

## Evidence template

```text
Date/time and timezone:
Tester:
Commit SHA:
Platform/device model:
OS version:
EAS build ID or local simulator build:
Profile: development / preview / local simulator
Package/bundle identifier:
API origin:
Install and first launch:
Camera granted / denied / blocked / cancel:
Library granted / denied / limited / blocked / cancel:
JPEG / PNG / WebP / HEIC:
Disguised / unsupported / oversized:
Offline / slow / timeout / retry:
Progress / cancel:
Force-close checkpoint and recovered result:
Duplicate submission:
Destination conflict:
Temporary-file cleanup:
ar / en / ckb and RTL/LTR:
Sanitized screenshot/video names:
First failure and reproduction:
Final result: PASS / FAIL / BLOCKED
```

Forbidden evidence includes passwords, session cookies, authorization
headers, account contact data, Expo/Apple/Google credentials, private artifact
URLs, device UDIDs/serials, database/provider URLs, presigned upload URLs,
original filenames, local image paths, EXIF/GPS, and raw image content.

## Build boundary

Development or Preview internal builds may be prepared only when authorized
and authenticated. Gate 7B never runs `eas submit`, `--auto-submit`,
`eas update`, a Production build, TestFlight submission, or Play submission.
If Apple, Google, EAS, or physical-device access blocks proof, repository and
simulator work continues and the exact external blocker remains explicit.
