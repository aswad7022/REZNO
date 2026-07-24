# Gate 6D Security Review

Status: **ACTIVE**. The author-side final diff review has no open P0, P1, or
P2. Independent review and merge are still required.

## Trust matrix

| Threat | Control |
| --- | --- |
| per-instance rate-limit bypass | atomic PostgreSQL upsert shared by all instances |
| raw identity retention | versioned HMAC key only; no raw IP/session/token/contact |
| missing-header fresh allowance | stable operation-scoped unidentified fallback |
| attacker-controlled proxy header | Vercel-owned header or one explicitly proven trusted header; chains rejected |
| rate store failure | production fail-closed 503; no memory downgrade |
| bucket retention/sprawl | short TTL and bounded 500-row cleanup job |
| forged runtime call | GitHub OIDC signature plus exact audience/repository/workflow/event/ref/SHA/time/JTI |
| bearer replay | unique JTI hash before invocation creation |
| old deployment execution | OIDC SHA must equal exact Vercel deployed SHA |
| overlapping runtime | transaction advisory lock plus one unexpired invocation lease |
| stale runtime publication | control generation, invocation lease, worker, UUID token and fence |
| stale job publication | Gate 6A job lease/fence plus Gate 6B/6C domain generation |
| authority revocation | current Admin or current runtime generation rechecked inside transaction |
| arbitrary work | closed 23-job/13-schedule registry and strict payload/result schemas |
| alert duplication | stable deduplication key plus transaction advisory lock and unique index |
| lifecycle race | row lock, exact optimistic version, serializable retry |
| changed replay | actor-scoped idempotency plus canonical request hash |
| stored-result injection | exact allow-listed replay result parsers |
| DTO/provider leakage | capped selects; observation schema validation; no raw metadata/provider payload |
| cursor forgery/cross-scope reuse | domain-separated HMAC bound to Admin scope/filter/page/snapshot |
| history tampering | append-only PostgreSQL update/delete triggers |
| cleanup overreach | exact fixture ownership, IDs, sentinels, fingerprints, repeated-zero cleanup |

## OIDC and workflow review

The route verifies identity before reading the bounded JSON body. Authorization
is never logged or returned. Responses expose only invocation UUID and state.
The workflow grants only `contents: read` and `id-token: write`, requests the
exact audience, keeps the token in a shell variable, and sends only the closed
`{"version":1}` body.

Production verification fails unavailable if `VERCEL_GIT_COMMIT_SHA` is absent
or malformed. It rejects a valid GitHub token whose SHA does not equal the
deployed application. Runtime control remains disabled and `NOT_CONNECTED`
before main-branch deployment and exact operator configuration.

## Database integrity

Migration 49 supplies closed enums, key/size/count/time constraints, explicit
nullable state/actor/target truth tables, restrictive foreign keys, due/list
indexes, unique replay/deduplication identities, and append-only triggers. It
adds no rows. Migration 48 remains byte-identical at:

`04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192`

Migration 49 SHA-256 is:

`6cd6ec39cc950600002f0b36529ea08460c539b8ced0176f37fbed2980a74f0c`

## Provider and log truth

Storage, scanner, Email, SMS, Push, payment, payout, and external queue
providers remain unconfigured. Deterministic adapters remain non-production
only. `ACCEPTED` still means provider acceptance, not human delivery.

Source, history, production build, server responses, iOS/Android Hermes
artifacts, and temporary output scans found no private key, bearer token,
exact staging credential, payment instrument, contact endpoint, or raw
provider payload. Exact staging-value scans were zero in source, build, and Git
history. Generic credential-pattern matches remained confined to examples,
tests, and dependency source-map regex text rather than credential values.

## Dependency review

Root and Mobile production audits report zero vulnerabilities. Mobile full
audit is zero. The live root full-tree audit reports nine High dependency
entries cascading from one newly disclosed `brace-expansion` memory-exhaustion
advisory, plus three Moderate entries from the Windows-only development chain
`shadcn` → MCP SDK → `@hono/node-server`. Every reachable 5.x
`brace-expansion` copy was patched to 5.0.8. The remaining copy is the
development-only 1.1.16 API required by ESLint 9's legacy `minimatch` 3 chain;
there is no patched 1.x release, and substituting the ESM/object 5.x API would
break that caller. npm therefore offers only an ESLint 10 major migration.
These tools consume trusted repository lint inputs and are absent from
production dependencies and artifacts, so the finding is classified as a
bounded development-tool denial-of-service risk, not a Gate 6D P0/P1/P2.
Forcing incompatible majors during closure would be a larger, unverified
change.

## Residual operational truths

- A database-backed monitor cannot durably record a database outage while the
  same database is unavailable. Requests fail closed, and the Admin overview
  reports availability only after a successful database-backed read.
- The GitHub scheduled runtime is not authentically observable before merge to
  default branch and exact Vercel deployment/configuration.
- Stage 3 expiry was not executed against shared staging because its historical
  script is global and has no exact reversible fixture cleanup. The canonical
  expiry handler is covered by the complete isolated PostgreSQL suite.
- Physical-device QA remains unperformed and belongs to Stage 7.

These are explicit boundaries, not claims of success.
