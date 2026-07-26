# Gate 7C Test Plan

Status: **AUTHOR VERIFIED — INDEPENDENT REVIEW PENDING**.

## Focused contract matrix

The Gate 7C suite must complete without failure, skip, todo, or cancellation:

- exact checkout-origin allowlists and production fail-closed behavior;
- strict return-link scheme, host, path, singleton keys, intent, and state;
- owner/intent/attempt/handoff/nonce/expiry signature binding and tampering;
- bodyless handoff and bounded return-body/query validation;
- Person authorization and foreign-intent concealment;
- idempotent handoff and atomic one-use return consumption;
- no financial state mutation from the return endpoint;
- warm-link single-flight and duplicate-link suppression;
- cold-start/process-death recovery without reopening checkout;
- lost consume-response recovery through read-only authoritative status;
- server status overriding success, failure, and cancel link hints;
- browser closure preserving a recoverable operation;
- offline/error retry with three automatic/five total checks;
- five-minute expiry cleanup;
- claim-time API-session capture across a cookie/account change;
- account switch quiescing the old browser runner before new-owner recovery;
- no sensitive logging or credential forwarding;
- `ar`, `en`, and `ckb` state coverage;
- Gate 7A release-origin and Gate 7B media regressions.

## Required repository checks

1. Focused Gate 7C and Gate 7A/7B regressions.
2. All Unit suites.
3. All PostgreSQL integration suites on a fresh disposable 49/49 database.
4. All HTTP/RSC/API suites against a production Next.js server.
5. Root and Mobile TypeScript, ESLint, and `git diff --check`.
6. Prisma format check, validation, and client generation.
7. Expo release config, dependency check, and Expo Doctor.
8. iOS/Android Hermes and Web exports.
9. Next.js production build.
10. Root production and Mobile dependency audits at zero.
11. Secret/privacy/payment/provider scan and migration checksums.

## Runtime scenarios

| Scenario | Expected result |
| --- | --- |
| Provider remains unconfigured | Stable 503, no durable handoff, no browser |
| Duplicate start | Existing runner/manifest reused; no second handoff |
| Warm link arrives while browser is open | One consume request and one authoritative result |
| Same link arrives again | No duplicate server work; replay remains explicit |
| Wrong intent/state/owner | Rejected before authoritative status work |
| App restarts after return was persisted | Bounded verification resumes; browser does not reopen |
| Consume succeeded but response was lost | Replay conflict followed by read-only intent status |
| Link says success while server says failed | UI is declined |
| Link says failure while server says captured | UI is confirmed |
| Browser closes | No financial claim; recoverable manifest remains |
| Network stays ambiguous | Bounded retry, then pending confirmation |
| Manifest expires | Cleanup, no reopen/consume |
| Account changes with browser open | Old runner aborts and releases before new-owner recovery |

## Device evidence boundary

Repository tests and exports do not prove a real hosted browser, universal
link callback, process death, or provider page. The current provider allowlist
is empty, so no real-provider device success can be performed. Gate 7D owns
physical-device and configured-provider evidence. See
`gate7c-device-evidence.md`.

## Author results

The complete author matrix ran on 2026-07-26. No skipped, cancelled, todo, or
hidden failure is counted as success.

| Check | Result |
| --- | --- |
| Gate 7C plus Gate 7A/7B regressions and release validator | `72/72` pass (`69 + 3`) |
| Complete Unit suites | `532/532` pass (`329 + 203`) |
| Complete PostgreSQL integration on a fresh 49/49 database | `426/426` pass |
| Complete live HTTP/RSC/API suites on the production server | `132/132` pass (`6 + 121 + 5`) |
| Root and Mobile TypeScript | PASS |
| Full ESLint and `git diff --check` | PASS, zero warning/error |
| Prisma format/validate/generate | PASS, Prisma Client `7.8.0` |
| Expo release config/install check/Doctor | PASS; dependencies current; `20/20` |
| iOS Hermes export | PASS; 952 modules; 3.3 MB bundle |
| Android Hermes export | PASS; 950 modules; 3.3 MB bundle |
| Expo Web export | PASS; 684 modules; 2.0 MB bundle |
| Next.js production build | PASS; compile/typecheck and `115/115` pages |
| Root production dependency audit | PASS; 0 findings |
| Mobile full dependency audit | PASS; 0 findings |
| Scoped secret/privacy/payment/provider scan | PASS |
| Migration chain and immutability | PASS; 49 directories, no schema/migration diff |

The PostgreSQL run used a newly created local disposable
`rezno_gate7c_test` database with every migration freshly deployed. The HTTP
run used the same database and a newly built Next.js production server on an
isolated loopback port. The hosted provider remains unconfigured, so the
expected live behavior is a stable fail-closed result without a durable
handoff or financial mutation.
