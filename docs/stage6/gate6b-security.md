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
| revoked or cross-scope execution | one closed job-type authority registry filters claim/schedule/requeue; every Gate 6B handler revalidates the operation owner, current Person/Admin grant, and joint permissions before claim and again after provider work |
| cross-Admin duplicate domain work | domain child identity excludes actor provenance, concurrent creation resolves to one canonical child, and the first creator remains immutable |
| PostgreSQL `CHECK` UNKNOWN bypass | Migration 47 preflights and replaces the six vulnerable operation/claim/output/profile/deletion constraints with complete `IS NULL`/`IS NOT NULL` truth tables; direct-SQL tests remove each required field individually |
| claimless/partial rendition state | Migration 47 requires an explicitly present positive fence in every active claim, permits only a complete processing claim, an idle-or-complete deletion claim, or a claim-free non-working state |
| partial rescan or worker operation | active rescan claims are exactly all-present or all-NULL; worker operations require explicit batch, closed worker identity, positive fence, lease/completion branch, and string result state; non-worker operations carry no worker field |
| partial rendition output or deletion metadata | complete and empty output tuples are explicit; dimensions are an inseparable positive profile-bounded pair; non-deletion states carry no deletion timestamp |
| remote serializable timeout/conflict leakage | storage, media and platform-job transaction wrappers retry only bounded Prisma `P2028`/`P2034`, PostgreSQL `40001`/`40P01`, or adapter conflict classifications; domain errors remain terminal and exhaustion maps to a safe closed error |
| Admin revocation | Person and Admin grant/permissions are read on every operation before mutation |
| payload privacy | closed reference schemas reject secret, auth, contact, address, VIN, payment, filename, bytes, URL, command and module-shaped data |
| staging cleanup overreach | exact `6b000000-…` rows/fixture actor, dependency-ordered cleanup, foreign sentinel hashes, whole-database non-fixture fingerprint, second cleanup zero |

## Dependency classification

Production dependency audit is zero and Mobile audit is zero. During closure,
newly published Next.js advisories classified `16.2.10` as affected by
Proxy/Turbopack authorization bypass, Server Action denial of service, SSRF,
cache-confusion, and related App Router issues. The direct dependency and
lockfile were moved to the exact patched `16.2.11` release; the production
build, 435 unit checks, and 120 built-server HTTP checks passed after the
upgrade. No High/Critical production advisory remains.

The full root
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

The prior authenticated staging closure completed at healthy 46/46 after the exact staging-role
rotation, old-credential authentication rejection, and fresh consumer
deployments. The replacement passed full TLS/identity/physical-Pool proof.
Migration 46 applied once with matching checksum and made the second deploy a
no-op. The 101-check Gate 6B smoke, 75/50/59 Gate 5A/Gate 5B/Gate 6A
successors, exact cleanup 70 then zero, stable foreign sentinels, and unchanged
whole-database non-fixture fingerprint passed.

The task-owned credential directory was mode 700 with mode-600 files and
cleanup traps. Exact replacement-value scans found zero repository, protected
output, task `/tmp`, or process-argument matches before the directory was
destroyed and its absence verified. Full reachable-history and source scans
found no token literal or private-key block; PostgreSQL URL findings were
limited to localhost/CI and explicit test/documentation placeholders. Browser
and Hermes artifacts contained no connection string, credential value,
provider key, signed target, or worker-operation authority. No staging
security finding remains open.

Migration 47 does not change the accepted credential-rotation boundary. No new
credential value was exposed, so no further rotation is authorized or needed.
The authenticated zero-write preflight proved healthy 46/46, all 15 sanitized
violation counts zero, the exact direct host/role/database, and TLS 1.3
hostname/system-CA verification. Canonical deploy applied only Migration 47,
matched checksum
`9596d3e94b852e5e8a794c9fc47f30decf67ad50e890ced7d5bc366704ee8b7d`,
and finished healthy 47/47; the second deploy was a no-op. The 166-check Gate
6B smoke and 75/50/59 predecessor smokes passed, cleanup removed 70 then zero,
protected domain counters returned to zero, and the non-fixture fingerprint
remained unchanged. Source/history, browser, and Hermes scans found no new
credential, private-key block, database URL, provider secret, or worker
authority exposure.
