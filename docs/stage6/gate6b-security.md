# Gate 6B Security Review

## Trust boundary

PostgreSQL domain rows are authority. A job payload is a bounded internal
reference, not ownership, tenant, provider, object, URL, checksum, MIME,
content, profile, or success authority. Every exact handler reloads canonical
state and revalidates its Gate 6A lease token/fencing generation immediately
before publication.

No open P0, P1, or P2 is accepted for independent review.

## Findings and controls

| Threat | Control and evidence |
| --- | --- |
| cross-Person/Organization cleanup or rescan | clients cannot submit owner/scope; exact IDs reload canonical owner; Admin grant and both permissions are revalidated transactionally |
| forged provider/key/URL, SSRF, traversal, prefix deletion | strict schemas omit them; keys are server-generated and database-constrained; provider API receives one canonical exact key; no URL fetch/list/prefix operation exists |
| cleanup claim theft/stale claim/duplicate job | conditional exact-version claim, 15-minute expiry, random job lease token and monotonic fence; dedupe binds item+generation |
| timeout treated as deletion or early quota release | only provider `READY` or confirmed `NOT_FOUND` changes canonical state to DELETED; uncertainty releases the claim for bounded retry and retains quota |
| ACTIVE binding deletion | discovery and item execution both deny it; PostgreSQL tests cover the race |
| ineligible/READY rescan churn | automatic policy is stale-version QUARANTINED only; READY requires an explicit jointly authorized exact-version operation |
| rescan source/binding race | HEAD/read/inspection/second HEAD occur outside locks; serializable commit checks source generation, claim and fence; unsafe rejection and detach/container/rendition transitions are atomic |
| legacy resurrection | canonical slot history suppresses detached legacy fallback |
| arbitrary profile or decompression bomb | three closed profiles; strict payload; bounded bytes/pages/pixels/dimensions; animated, malformed and polyglot sources fail closed |
| EXIF/GPS/ICC leakage | deterministic Sharp pipeline carries no metadata; output is bounded-read and inspected in tests |
| stale publication/duplicate output/overwrite | unique source-version-profile identity, expiring single claim, deterministic write-once key, verified HEAD/readback, and final source/binding/fence reload |
| derived cleanup overreach | exact rendition ID and canonical derived key only; source key is never accepted or deleted by rendition cleanup |
| provider/key/checksum/signed-target leakage | Admin/job/media DTOs omit them; status/detail are no-store and expose closed safe metadata only |
| raw provider error leakage | provider outcomes map to closed safe job codes; staging scripts log only safe phase/evidence |
| deterministic adapter in production | registry/test setter refuses production; runtime reports `NOT_CONFIGURED` |
| hot loop or retry storm | configuration/stale/permanent policy failures do not retry; transient work uses bounded Gate 6A attempts/backoff and dead-letter |
| schedule amplification | bounded batch/catch-up, occurrence dedupe, disabled-by-default fixture, no automatic invoker |
| stale worker | domain publication checks current job row, token, lease expiry and fencing generation |
| remote serializable timeout/conflict leakage | storage, media and platform-job transaction wrappers retry only bounded Prisma `P2028`/`P2034`, PostgreSQL `40001`/`40P01`, or adapter conflict classifications; domain errors remain terminal and exhaustion maps to a safe closed error |
| Admin revocation | Person and Admin grant/permissions are read on every operation before mutation |
| payload privacy | closed reference schemas reject secret, auth, contact, address, VIN, payment, filename, bytes, URL, command and module-shaped data |
| staging cleanup overreach | exact `6b000000-…` rows/fixture actor, dependency-ordered cleanup, foreign sentinel hashes, whole-database non-fixture fingerprint, second cleanup zero |

## Dependency classification

Production dependency audit is zero and Mobile audit is zero. The full root
audit has three Moderate findings in one development-only chain:
`shadcn` → `@modelcontextprotocol/sdk` → `@hono/node-server@1.19.13`.
The advisory concerns Windows encoded-backslash static-file traversal. REZNO
does not import or ship that server in production, browser, Mobile, worker, or
Gate 6B paths; the tested/deployed runtime is not the vulnerable Windows
static-server configuration. This is accepted as P3 development-tool exposure.
The automatic audit suggestion is a semver-major shadcn downgrade and is not an
appropriate production fix.

## Residual boundaries

No production storage/scanner/transformation provider, external queue, cron,
or always-on worker is connected, so real provider behavior is not claimed.
Physical-device media QA remains Stage 7. Gate 6C owns communications/payment
automation; Gate 6D owns runtime activation, distributed coordination,
monitoring, alerts, incidents, and final cross-gate closure.

Authenticated staging completed at healthy 45/45 with the full TLS/identity
proof, 64 Gate 6B smoke checks, 75/50/59 Gate 5A/Gate 5B/Gate 6A successor
checks, exact cleanup 58 then zero, stable foreign sentinels, and an unchanged
whole-database non-fixture fingerprint. No staging finding remains open.
