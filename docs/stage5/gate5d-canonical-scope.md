# Gate 5D — Stage 5 integrated closure

Status: canonical scope confirmed before implementation.

Baseline: `origin/main` at
`f8c8d794e9e08fffe96a8d31187e80ee305c0080`, the merge commit of PR #123,
with exactly 42 repository migrations. PR #100 remains an untouched Open Draft
at `e46454df993ecccb06180060dda4353ec88e2641`.

## Repository evidence

The following accepted repository evidence defines this gate:

- `docs/storage/gate5a-managed-storage-foundation.md`, **Scope and
  boundaries**, assigns Gate 5D the “Stage 5 integrated closure” and assigns
  scheduled workers, queues, distributed limits, provider webhooks, and
  automatic cleanup/rescans to Stage 6.
- `docs/media/gate5b-media-lifecycle-integration.md`, **Scope and
  exclusions**, keeps persistent transformations, provider webhooks,
  schedulers, message/review/campaign attachments, documents, video/audio,
  physical-device QA, and visual redesign outside Gate 5B. Its final handoff
  says Gate 5D receives the Gate 5B document, migration/staging/CI evidence,
  provider truth, and physical-device deferral for Stage 5 closure.
- `docs/payments/gate5c-payments-financial-integrity.md`, **Explicit
  later-stage handoffs**, defines Gate 5D as the independent Stage 5 closure
  containing full media/storage/payment cross-gate QA, an accepted-provider
  operational decision when one is available, production runbooks, and closure
  evidence. The same section assigns asynchronous provider-event processing,
  retries, scheduled reconciliation/settlement orchestration, durable queues,
  and operational workers to Stage 6.
- `docs/communications/stage4-closure.md`, **Deferred-work register**, locks
  Stage 5 to managed uploads/media/storage/payments and Stage 6 to automatic
  schedulers, queues, distributed limiting, provider receipts/webhooks, and
  expanded platform operations. Stage 7 owns physical-device and signed-release
  QA; Stage 8 owns broad visual polish.
- Merged PRs #121, #122, and #123 and their accepted review discussions provide
  the immutable Gate 5A, Gate 5B, and Gate 5C implementation, security,
  migration, CI, provider-truth, and real-staging evidence. Their exact heads
  are respectively `72e47c1fd2dbd9f8e699166bf464e1f49f1950e0`,
  `207e408028b01b188f6fee526f51792a853d7540`, and
  `82edffa7dff8e2f32de06f2e2bf6e1dffa771570`.
- Main history contains the three Stage 5 merge commits:
  `52658f15ed050b57c79cb91faeb3e97645b1a116` (5A),
  `cb32cf401bc0f060940ec71dffba76f8d5089733` (5B), and
  `f8c8d794e9e08fffe96a8d31187e80ee305c0080` (5C).
- Repository and GitHub searches found no Gate 5D implementation, branch, PR,
  issue, reserved test, migration 43, or Stage 6 implementation at baseline.
- `docs/04-ARCHITECTURE.md` supplies general modularity, security, data, Web,
  internationalization, and maintainability principles. `docs/07-roadmap.md`
  is an older generic phase roadmap and does not define the accepted numbered
  Gate 5D scope. No root README or `HANDOFF.md` exists at this baseline.

These sources are mutually consistent: Gate 5D closes and verifies the three
already implemented Stage 5 domains. It does not add a fourth product domain.

## Objective

Independently close Stage 5 by proving that managed storage, canonical media,
and payment/financial-integrity foundations coexist safely end to end; record
truthful production-provider decisions and bounded operator procedures; close
any defect found by that integration review; and publish reproducible local,
PostgreSQL, HTTP, migration, staging, security, Web, and Mobile evidence.

## Included capabilities

Gate 5D includes only:

1. A versioned Stage 5 closure registry that locks accepted Gate 5A–5C
   invariants, provider truth, manual-operation bounds, and later-stage
   ownership.
2. Cross-gate contract tests for identity, Person/Organization/Admin authority,
   canonical storage-to-media ownership, payment target authority, idempotency,
   concurrency, cursor separation, privacy, and fail-closed production
   providers.
3. PostgreSQL integration coverage proving Gate 5A storage, Gate 5B media
   bindings, and Gate 5C payment/ledger records coexist without cross-tenant,
   cross-purpose, cleanup, or financial-integrity interference.
4. Production HTTP/RSC/API closure coverage across the existing Customer,
   Business, Admin, public media, and payment capability surfaces.
5. A single guarded Stage 5 staging fixture orchestration that composes the
   accepted 5A, 5B, and 5C deterministic fixtures, produces a deterministic
   combined fingerprint, supports read-only cross-gate smoke, and cleans only
   exact fixture-owned IDs in dependency-safe order.
6. A production-operations runbook for the current fail-closed provider state,
   bounded manual storage cleanup, media delivery diagnosis, payment
   reconciliation, settlement-statement handling, incident response, rollback,
   and Stage 6 handoff.
7. Final Stage 5 closure evidence covering local validation, migration
   integrity, real staging, exact-head CI/Preview, security review, and truthful
   unresolved limitations.
8. Closure-only P0/P1/P2 remediation when the audit finds a concrete defect.

## Excluded capabilities

Gate 5D excludes:

- any new product domain, user journey, broad UI redesign, or unrelated polish;
- production storage, malware-scanner, CDN-transformation, or payment-provider
  onboarding without a separately accepted provider and authorized credentials;
- fabricated provider configuration or claims of real upload, capture, refund,
  payout, remittance, or bank settlement;
- persistent renditions, remote import, documents, video/audio, or
  message/review/campaign attachments;
- asynchronous provider-event processing, automatic cleanup/rescans,
  reconciliation/settlement scheduling, Vercel Cron, durable workers/queues,
  distributed locks/limits, or expanded platform-operations dashboards;
- Stage 6, Stage 7, Stage 8, AI work, and changes to deferred PR #100;
- physical-device, camera/library, HEIC, deep-link, process-death, poor-network,
  TestFlight, signed-release, or real-provider receipt QA.

## Data-model impact

No new business entity or persisted lifecycle is required. Gates 5A–5C already
own the canonical storage, media, payment, ledger, settlement, and mutation
models. Gate 5D adds no column, enum, index, table, backfill, or fabricated row.
The repository must remain at exactly 42 migrations and migration 43 must not
exist.

If independent review finds a genuine database defect, implementation stops and
the scope/migration decision is re-audited before any schema change. A closure
test or runbook is not sufficient justification for a migration.

## Provider impact and production decision

No accepted persistent production storage provider, malware scanner,
transformation provider, or online payment provider is present in repository or
merged-PR evidence. The canonical Gate 5D operational decision is therefore:

- storage: `STORAGE_PROVIDER_NOT_CONFIGURED`;
- malware scanner: `SCANNER_NOT_CONFIGURED`;
- online payments: `PAYMENT_PROVIDER_NOT_CONFIGURED`;
- deterministic storage/payment adapters: tests and exact guarded staging
  operator only, impossible to select from production client input;
- media delivery: the Gate 5B stable path remains backed by the truthful Gate 5A
  provider capability and fails closed when provider delivery is unavailable;
- settlements: immutable ledger statements, not bank payout proof.

Gate 5D records provider-onboarding prerequisites but does not choose a vendor,
invent credentials, or claim a live integration.

## Web impact

No new Web product surface is required. Gate 5D verifies the existing Customer
storage/avatar and payment views, Business media/payment/settlement views,
Admin storage/media/payment/reconciliation views, and public managed-media
delivery. Web code changes are limited to a confirmed closure defect. Existing
localization, accessibility, strict DTO, no-store, and same-origin boundaries
remain authoritative.

## Mobile impact

No new Mobile product surface is required. Gate 5D verifies Mobile TypeScript,
the existing Customer managed-avatar/media and payment contracts, Expo
dependencies/Doctor, and iOS/Android Hermes exports. Physical-device and
release-channel proof remains explicitly deferred to Stage 7.

## Admin impact

Gate 5D verifies current permissions and revocation for storage record
view/manage, atomic rejected-media detach, payment view/refund/reconciliation,
and settlement view/manage. It introduces no global operator bypass, owner
impersonation, private-media download grant, arbitrary ledger mutation,
standalone mark-paid control, or unbounded Admin query.

## Operations impact

The gate documents and validates only bounded manual entrypoints already
exported by completed gates:

- exact-key storage cleanup/retry with bounded batches and no bucket-wide list
  or delete;
- canonical media delivery/capability diagnosis with no remote URL import;
- bounded, non-mutating payment reconciliation;
- immutable settlement-statement finalization/void policy with no payout claim.

Automatic invocation, retries, monitoring orchestration, queues, distributed
coordination, and expanded production-operations surfaces remain Stage 6.

## Security requirements

Closure must re-prove:

- authentication before cursor/body/target work;
- server-derived Person, active Organization, membership/Role, and current
  Admin permission authority;
- foreign Person, Organization, target, asset, binding, intent, refund, Journal,
  and settlement isolation;
- actor/scope/action-bound idempotency and optimistic versions;
- serializable/locked quota, attachment, refund, Journal, and settlement
  invariants under races and retries;
- bounded pages, batches, queues, request bodies, provider responses, and
  retries;
- exact generated object namespaces with no path traversal, bucket escape,
  remote import, or SSRF;
- no provider credential, database URL, signed URL, object key, checksum, raw
  webhook, payment instrument, contact/address/VIN, or cross-tenant metadata in
  DTOs, logs, audits, source, history, or build artifacts;
- authenticated, bounded, replay-safe provider callbacks and preserved raw-byte
  signature input;
- fail-closed production test-provider injection;
- exact-ID fixture cleanup that cannot touch foreign or historical rows;
- byte integrity of migrations 1–42 and absence of migration 43.

No known P0, P1, or P2 may remain before Ready for Review.

## Staging requirements

Real-staging closure requires authenticated, non-printing access to exact
`rezno_staging`, the intended role, a direct encrypted endpoint, and healthy
42/42 migrations. It must:

1. record a whole-database non-fixture fingerprint;
2. prove `prisma migrate deploy` is a no-op and migration checksums match;
3. run the combined Stage 5 fixture twice with an identical fingerprint;
4. run the accepted focused 5A, 5B, and 5C smokes plus the read-only cross-gate
   closure smoke;
5. prove production storage/payment provider truth remains not configured;
6. perform dependency-safe exact-ID cleanup;
7. run cleanup a second time and receive zero for every category;
8. prove no fixture rows remain, the non-fixture fingerprint is unchanged, and
   staging remains healthy 42/42.

Credentials, connection strings, signed targets, OIDC files, or provider
secrets must never be printed or persisted. Production database credentials and
roles are out of scope.

## Testing matrix

| Layer | Required evidence |
| --- | --- |
| Static | root ESLint, non-incremental root TypeScript, Mobile TypeScript, Prisma format/validate/generate, `git diff --check` |
| Unit | focused Gate 5D contracts, all 5A/5B/5C unit tests, complete unit suite |
| PostgreSQL | focused cross-gate closure, all 5A/5B/5C PostgreSQL tests, complete PostgreSQL suite and query-plan evidence where a query changes |
| HTTP/RSC/API | focused Stage 5 closure routes/contracts and complete live suite |
| Regressions | Stage 1–4, Identity, Stage 2, Bookings, Restaurant, Reviews, Marketplace, Cart/Checkout, Orders, Favorites, Admin authorization |
| Web | Next production build and existing Customer/Business/Admin/public Stage 5 surfaces |
| Mobile | Expo dependency validation, Expo Doctor, iOS Hermes export, Android Hermes export; no physical-device claim |
| Supply chain/privacy | root/Mobile audits; source, Git history, build artifact, provider credential, payment-instrument, VIN/contact/address scans |
| Migration/staging | exact 42 baseline, no migration 43, no-op rehearsal, two-run fixture, smokes, exact cleanup twice, invariant fingerprint |

## Migration policy

Gate 5D requires no schema change. Migrations 1–42 are immutable, the count
stays 42, and fresh/populated rehearsal verifies their accepted chain without
reset or `db push`. No migration 43 is created.

## Rollback policy

Application closure additions are documentation, registries, tests, and guarded
operators. They may be reverted as ordinary code without data rollback. Staging
fixtures are removed only through exact deterministic IDs in reverse dependency
order; a second cleanup must be a no-op. Existing Stage 5 data is never reset,
rewritten, or broadly deleted. Provider activation is not part of this gate, so
there is no provider cutover to roll back.

## Gate 5D completion criteria

Gate 5D is complete only when:

- scope, provider decision, runbooks, and closure evidence are committed;
- migration count is exactly 42 and no migration 43 exists;
- focused and complete local matrices pass;
- full cross-gate security review has no P0/P1/P2;
- authenticated staging satisfies the two-run fixture, smokes, exact cleanup,
  zero second cleanup, fingerprint, and 42/42 requirements;
- exact-head GitHub Actions and both Vercel checks pass;
- unresolved review threads are zero and independent review is complete;
- PR #100 remains Open, Draft, unmerged, and unchanged;
- physical-device QA is reported as not performed;
- the Draft PR is not automatically merged.

## Stage 5 completion criteria

Stage 5 closes only with accepted Gate 5A, Gate 5B, and Gate 5C history plus
completed Gate 5D evidence proving their integrated security, provider truth,
operations, regressions, and staging invariants. A passing Gate 5D Draft PR is
review-ready evidence; Stage 5 is not officially merged/closed until that PR is
independently reviewed and merged.

## Explicit Stage 6 boundary

Stage 6 remains unstarted. It owns durable workers and queues, automatic
scheduling, distributed coordination/rate limits, asynchronous provider-event
processing and retries, automatic storage cleanup/rescans, rendition
orchestration, scheduled reconciliation/settlement operations, provider
webhooks/receipts beyond the bounded synchronous foundation, and expanded
platform-operations dashboards. Gate 5D may document these handoffs but may not
implement them.

## PR #100 boundary

PR #100 must remain Open, Draft, unmerged, unchanged, and at exact head
`e46454df993ecccb06180060dda4353ec88e2641`. Gate 5D does not inspect or
modify its branch, body, commits, state, review status, or protected checkout.

## Physical-device QA boundary

Physical-device QA was not performed by Gates 5A–5C and is not part of Gate 5D.
iOS/Android static Hermes exports are build evidence only. Physical camera/
library, HEIC, hosted payment action, deep-link return, process-death recovery,
poor-network behavior, signed builds, and real-device provider receipts remain
Stage 7 work.
