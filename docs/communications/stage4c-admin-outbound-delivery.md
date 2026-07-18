# Stage 4C — Admin Communications and Outbound Delivery

Status: architecture audit and policy baseline, completed before production implementation.

Baseline: `origin/main` and the isolated Gate 4C branch both started at `ed94620ddbc987481edbad3b6d7e67652b010d14`, the merge commit for PR #118 and Gate 4B. The real staging baseline reported 37 migrations, an up-to-date schema, and a successful Next.js build. PR #100 is outside this gate and remains protected.

## Gate objective

Gate 4C introduces one canonical Admin communication-campaign lifecycle, keeps Gate 4A as the canonical in-app notification producer, and adds a provider-neutral outbound-delivery foundation. It must support drafts, scheduling persistence, preview, immutable recipient snapshots, personal outbound consent, delivery attempts, bounded retries, deterministic manual dispatch, staging-safe provider simulation, reporting, and audit.

The following are foundation-only in this gate and must not be represented as operational production delivery:

- automatic production scheduling and always-on background workers (Stage 6);
- real APNs/FCM device registration and delivery (Stage 7);
- speculative SMS/email vendors or provider receipt processing;
- physical-device QA (Stage 7);
- Gate 4D closure work.

## Phase 1 architecture audit

### Required findings

1. **Existing Admin announcement write path.** `/admin/notifications` renders `AdminNotificationForm`; its Server Action `createAdminNotification` calls `createAdminAnnouncement`, which writes directly through the Gate 4A canonical producer. There is no `/admin/communications` route yet.
2. **Existing Admin permissions.** The current route and action use only `NOTIFICATIONS_SEND`; there is no separate view or manual-dispatch capability.
3. **Creation idempotency.** The existing write is not idempotent. It accepts no UUID key or canonical request hash and creates a random announcement/event identity.
4. **Transactional Admin revalidation.** Current Admin authentication/authorization is resolved before the write transaction and is not revalidated inside the authoritative transaction. Revocation, expiry, suspension, or allowlist removal can race the write.
5. **Existing audiences.** `NotificationAudience` contains `ALL`, `CUSTOMERS`, `BUSINESS_OWNERS`, `RESTAURANTS`, `BUSINESS`, and `USER`. `USER` targets one Person, `BUSINESS` targets one Organization, and the others are broadcasts evaluated by Gate 4A visibility rules.
6. **Scheduling.** Current announcements cannot be scheduled.
7. **Draft/cancel.** Current announcements have neither draft nor cancellation lifecycle.
8. **History pagination.** Current history is a fixed `take: 50`; it has no cursor pagination or filters.
9. **In-app exact-once.** The Gate 4A producer uses a unique deterministic `eventKey` and conflict-safe creation. Broadcast notifications remain one Notification rather than one row per Person; Person-owned read/archive state is held separately.
10. **Current outbound preferences.** There are no outbound channel preferences. `NotificationPreference` and `NotificationPreferenceSuppression` are Person-owned in-app controls exposed to Customer Web, Business Web, and Customer Mobile.
11. **Verified contacts.** `User.email` plus `User.emailVerified` is the authoritative verified email source. `Person.phone` exists without a verification field, so no existing phone qualifies for SMS. Booking/order snapshots are not contact sources.
12. **Push tokens.** No mobile device-token or verified push-endpoint model exists.
13. **Provider adapters.** No SMTP, Nodemailer, Mailpit, Resend, SendGrid, Postmark, Twilio, SMS, APNs, FCM, or Expo Push adapter exists, and no corresponding provider dependency is installed.
14. **Queue/outbox.** No communication outbox, per-recipient delivery model, or provider attempt ledger exists. The unrelated agent/operator queue is not reusable for outbound communications.
15. **Scheduler/cron.** No Vercel Cron or scheduled workflow exists. The current GitHub workflow is PR/manual CI only.
16. **Retry policy.** No outbound retry/backoff policy exists.
17. **Delivery status.** There is no provider delivery-status model.
18. **Receipts/webhooks.** There is no provider receipt or webhook processing.
19. **Unsubscribe/suppression.** Gate 4A has category suppression intervals for in-app visibility, but no outbound consent/unsubscribe record.
20. **Content and PII in logs.** Current announcement failures can pass a raw Error to the server logger, which includes message and stack. Campaign bodies and contacts are not deliberately logged today, but raw provider errors would be unsafe. Gate 4C must log only sanitized codes and identifiers.
21. **Arbitrary URLs.** The old form does not accept a URL, and Gate 4A already has typed destinations. Gate 4C must not introduce URL, path, protocol, query, redirect, or deep-link input.
22. **Arbitrary HTML.** The old form accepts plain title/body only, but lacks explicit HTML/control/header-injection rejection. Gate 4C will prohibit Admin-authored HTML and generate escaped email HTML itself.
23. **Bounded audience evaluation.** The old producer does not materialize recipients. The old UI embeds up to 200 People and 200 Organizations, and preview/fanout limits do not exist.
24. **Large-fanout risk.** A future naive outbound fanout could perform an unbounded scan and transaction. Gate 4C must cap preview/search, page recipient evaluation, and fail closed above a documented dispatch maximum.
25. **Duplicate-send risk.** The old in-app event is protected only when its generated key is retained, but the action itself has no exact replay. There is no outbound uniqueness, claim lease, stable provider key, or attempt uniqueness.
26. **Permission-revocation race.** Because current permission resolution is outside the transaction, a revoked or expired Admin may win a race. Every Gate 4C read/mutation/dispatch operation must re-evaluate current identity and permission in the authoritative transaction.
27. **Timezone handling.** The current announcement action has no schedule. Gate 4C will accept only canonical timezone-aware ISO-8601 instants, store UTC, reject stale/malformed input, and cap the horizon at 365 days.
28. **Inactive/deleted recipients.** Existing direct target lookup checks `deletedAt` but not the complete active/onboarded policy. Gate 4C will require active, non-deleted, onboarded People at snapshot and recheck before claim/send.
29. **Role/membership changes.** Current target validation is before the transaction and does not cover a later outbound lifecycle. Gate 4C will snapshot current audience membership at dispatch, then recheck Person, Organization, membership, and role eligibility immediately before provider work; invalid recipients become `SUPPRESSED`.
30. **Migration 38.** Migration 38 is required because no campaign, mutation ledger, outbound preference, delivery, attempt, or phone-verification schema exists. Migrations 1–37 remain byte-for-byte unchanged, and Gate 4C must not create migration 39.
31. **Required indexes and plans.** Evidence is required for campaign cursor listing, scheduled scans, due/expired claim scans, delivery cursor listing, retry scans, counters, preference lookup, audience membership, endpoint eligibility, and bounded target search. The minimum candidate indexes are specified below; speculative indexes are prohibited.
32. **Gate 4D boundary.** Gate 4D owns Stage 4 closure, cross-gate communications QA, closure documentation, and any closure-only remediation. Gate 4C stops with its Draft PR ready for review and must not start Gate 4D.
33. **Stage 6 boundary.** Stage 6 owns connecting the exported due-dispatch service/CLI entrypoint to a durable production scheduler/worker and distributed operational controls. Gate 4C persists schedules and provides authorized manual deterministic dispatch only.
34. **Stage 7 boundary.** Stage 7 owns verified device registration/token lifecycle, APNs/FCM credentials/adapters, physical-device push QA, and production push delivery. Gate 4C supplies the neutral push contract, consent state, missing-endpoint behavior, and guarded deterministic sink only.

### Existing surface and compatibility conclusions

- `/admin/notifications` is the only current Admin announcement UI. It will redirect to `/admin/communications` after the canonical route exists.
- The legacy action must not remain production-reachable as an alternate writer. Historical `Notification` rows remain untouched and visible through the existing Notification Center.
- Existing target selectors must be replaced by bounded search; large People/Organization datasets must not be serialized into HTML.
- Existing rate limiting is process-local (`lib/security/rate-limit-core.ts`). It can be a defense-in-depth guard for the manual Admin surface, but is not a distributed worker control and does not satisfy Stage 6.
- Existing best-effort `logAdminAuditEvent` is not sufficient for campaign mutations. Gate 4C writes the campaign mutation ledger and `AdminAuditLog` atomically in the same transaction.

## Locked authorization policy

The permission registry will contain:

| Capability | Permission | Notes |
| --- | --- | --- |
| View campaigns, details, delivery attempts, and safe reports | `NOTIFICATIONS_VIEW` | Also controls Admin navigation. |
| Create/edit/schedule/send/cancel campaigns | `NOTIFICATIONS_SEND` | Existing permission retained; requires view. |
| Manually claim/process due work | `COMMUNICATIONS_DISPATCH` | Requires send and view. |

Migration 38 backfills `NOTIFICATIONS_VIEW` for persisted active grants that already include `NOTIFICATIONS_SEND`. `COMMUNICATIONS_DISPATCH` is not granted implicitly. Permission dependencies are transitive and resolved as a closure, not a one-level check.

Every operation authenticates the current Admin, resolves active Person/User, and revalidates current `AdminAccess` or the environment-superadmin allowlist inside the authoritative transaction. An environment superadmin remains an explicit audited actor. Button visibility is never authorization.

## Canonical domain policy

### Campaign lifecycle

`DRAFT → SCHEDULED → DISPATCHING → COMPLETED | PARTIAL_FAILURE | FAILED`

`DRAFT` may also go directly to `DISPATCHING`. `QUEUED` is retained as an explicit persisted ready state for dispatch coordination. `DRAFT` and `SCHEDULED` may become `CANCELLED`. Cancellation after snapshot cancels only unclaimed `PENDING`/`RETRY_SCHEDULED` work; accepted and completed attempts remain immutable, and an owned in-flight claim may finalize.

Before dispatch, expected-version mutations may edit content, audience, channels, destination, and schedule. Once dispatch begins, those fields are immutable. Campaigns are never hard-deleted.

Final state is derived from terminal rows, never client input:

- `COMPLETED`: all selected work is terminal with no permanent/provider failure; suppressed rows remain separately reported and do not masquerade as acceptance.
- `PARTIAL_FAILURE`: at least one outbound delivery was accepted and at least one ended in permanent/not-configured failure.
- `FAILED`: no outbound delivery was accepted and at least one ended in permanent/not-configured failure.
- in-app-only campaigns complete after the one canonical Gate 4A Notification is committed.

### Campaign fields

The schema will hold the required campaign identity/version, acting Admin IDs, lifecycle status, audience and exact optional Person/Organization target, selected channels, category, priority, mandatory flag, typed destination, localized content, schedule/evaluation/dispatch/completion/cancellation timestamps, bounded cancellation reason, and timestamps. It will never store client-provided actor data, recipient SQL, or arbitrary query JSON.

### Idempotency and concurrency

Create, update, schedule, send-now, cancel, manual dispatch, outbound preference update, and any exposed retry operation require a UUID idempotency key. A canonical request hash binds the actor, action, campaign, expected version, content, audience, channels, schedule, and destination.

- exact replay returns the stored result;
- changed replay returns `IDEMPOTENCY_CONFLICT`;
- stale expected version returns `STALE_VERSION`;
- unique constraints prevent duplicate campaigns, Gate 4A events, campaign/Person/channel deliveries, attempts, and Admin audit rows.

`CommunicationCampaignMutation` is dedicated to this domain; Message and Order ledgers are not reused. A mutation row and exact `AdminAuditLog` row are committed atomically with the domain transition.

## Content, locale, and destination policy

The external locale contract is `AR`, `EN`, and `CKB`. Existing Person `KU` maps to `CKB`; `TR` falls back to `EN`. Campaign authoring supplies all three locale records so dispatch never depends on mutable copy. Each locale contains only the selected channels' bounded plain fields:

- in-app: title and body;
- email: subject and plain-text body; escaped platform-owned HTML is generated at send time;
- SMS: bounded plain-text body;
- push: title and bounded body.

Gate 4C uses zero personalization variables. It rejects unknown keys, controls, CR/LF in headers, invalid line endings, excessive Unicode code-point length, raw HTML, `script`, `iframe`, inline event handlers, `javascript:`, `data:`, provider payload overrides, and executable/template expressions. Content, contact endpoints, and rendered provider payloads never enter audit metadata or logs.

Destination allowlist:

| Audience | Allowed destination | Target |
| --- | --- | --- |
| `ALL`, `CUSTOMERS`, `BUSINESS_OWNERS`, `RESTAURANTS` | `NOTIFICATIONS` | none |
| `USER` | `NOTIFICATIONS`, `CUSTOMER_ACCOUNT`, `CUSTOMER_MESSAGES` | none in Gate 4C |
| `BUSINESS` | `NOTIFICATIONS`, `BUSINESS_NOTIFICATIONS`, `BUSINESS_MESSAGES` | none in Gate 4C |

Arbitrary URLs/paths/protocols/query strings/deep-link payloads are impossible by contract. Gate 4A serialization authorizes the typed destination and falls back to Notification Center. External links are generated only by a platform-owned mapping. `destinationTargetId` remains nullable in the model for the typed architecture, but Gate 4C validation rejects non-null values until a currently authorized target kind is implemented.

## Audience, snapshot, and revalidation policy

- `ALL` and `CUSTOMERS`: active, onboarded, non-deleted People. No separate canonical Customer-role model exists, so these have the same Person eligibility in this gate.
- `USER`: one exact active, onboarded, non-deleted Person.
- `BUSINESS`: active current `OWNER`, `MANAGER`, or `RECEPTIONIST` members of one exact active Organization.
- `BUSINESS_OWNERS`: current active `OWNER` memberships in active Organizations.
- `RESTAURANTS`: current active `OWNER`, `MANAGER`, or `RECEPTIONIST` members of active `RESTAURANT` or `CAFE` Organizations.

People are deduplicated by Person ID. Preview scans at most 5,001 candidates, reports at most 5 Person UUID samples, and fails closed as too large above the 5,000-recipient dispatch ceiling. It reports eligible, suppressed, missing-endpoint, and inactive/revoked totals per selected channel without email, phone, token, or contact lists.

At dispatch start, a serializable transaction evaluates the current bounded audience, creates the single canonical in-app Notification when selected, and inserts immutable outbound delivery identities for `EMAIL`, `SMS`, and `PUSH`. No later audience member is added to that campaign. Rows for preference suppression, missing endpoints, or ineligibility are retained as `SUPPRESSED` for truthful reporting.

Immediately before any provider call, the dispatcher rechecks current Person status, onboarding/deletion, current audience membership/Organization/role, current preference, endpoint verification, endpoint fingerprint, campaign cancellation, and provider eligibility. A change makes the row `SUPPRESSED` without a provider call. This conservative recheck means preference revocation and identity invalidation before claim are respected; historical accepted attempts remain unchanged.

## Preference and endpoint policy

Outbound preferences are one versioned Person-owned matrix for `EMAIL`, `SMS`, and `PUSH` over `BOOKINGS`, `RESTAURANT`, `COMMERCE`, `MESSAGES`, `ACCOUNT`, and `ADMIN_ANNOUNCEMENT`. Channel/category arrays default empty: optional outbound delivery requires explicit opt-in. Active-Business switching never creates or mutates an Organization profile. Changes affect future eligibility only and preserve historical deliveries.

Only `ACCOUNT` may be marked mandatory. Mandatory `ACCOUNT` bypasses preference suppression but never endpoint verification, recipient eligibility, provider configuration, or safety controls. An Admin announcement cannot be reclassified as mandatory/security to bypass consent. Existing Gate 4A in-app preferences remain authoritative for in-app channels.

Endpoint resolution is centralized and returns eligibility plus a nonreversible fingerprint, never a raw contact in a DTO or log:

- email: normalized `User.email` only when `emailVerified` is true and header/address validation passes;
- SMS: normalized `Person.phone` only after the new `phoneVerifiedAt` is non-null; migration 38 does not mark historical phones verified;
- push: `MISSING_ENDPOINT` in production because no verified device-token model exists. Tests/staging may inject an opaque guarded endpoint resolver; production rejects it.

Raw endpoints are resolved only just-in-time for an owned attempt and are not duplicated into delivery rows.

## Provider and delivery policy

The neutral provider interface supports `EMAIL`, `SMS`, and `PUSH` and returns only `ACCEPTED`, `TRANSIENT_FAILURE`, `PERMANENT_FAILURE`, or `NOT_CONFIGURED`, with a redacted provider name, optional provider message ID, retryability, and safe code. Default production adapters return `NOT_CONFIGURED`; no vendor dependency is added speculatively.

The deterministic sink is available only when all guards agree: explicit enable marker, confirmed local/test or the exact staging database, and non-production runtime. It rejects production/live, requires no credential, emits a deterministic message ID from delivery identity, supports accepted/transient/permanent scenarios and retry testing, and never logs an endpoint. Its result is labelled provider acceptance/staging sink acceptance, never human delivery.

Every outbound delivery is unique by campaign, Person, and channel. It stores locale, endpoint kind/fingerprint, status, attempt count, next-attempt time, claim owner/lease, accepted/failed timestamps, safe suppression reason, safe provider/message identifiers, and timestamps. It does not duplicate campaign bodies or endpoints.

Every provider call owns exactly one unique `(deliveryId, attemptNumber)` attempt with start/end, outcome, provider, safe code, retryability, next-attempt time, and bounded sanitized metadata. Raw errors, stack traces, responses, endpoints, authorization headers, and payloads are prohibited.

### Claims and retries

- claim query: PostgreSQL `FOR UPDATE SKIP LOCKED`, ordered and bounded to 50 rows;
- lease: 5 minutes with an exact opaque owner;
- maximum attempts: 5;
- stepped backoff after transient failures: 1 minute, 5 minutes, 30 minutes, 2 hours, then 12 hours;
- permanent and not-configured outcomes are not retried automatically;
- expired claims are recovered deterministically and the abandoned ownership is finalized without a second copy of the same attempt;
- the provider idempotency key is stable per delivery, not per attempt, so a conforming adapter can deduplicate uncertain retries;
- cancelled campaigns create no new claims.

The dispatcher exports bounded services for recipient evaluation, enqueue/snapshot, due claim, batch processing, expired-lease recovery, due retry, and campaign finalization. Manual due dispatch requires `COMMUNICATIONS_DISPATCH`. No timer, cron, daemon, or always-on worker is installed in Gate 4C.

## Scheduling policy

Admin input is a canonical timezone-aware ISO-8601 instant and is normalized to UTC. Scheduling rejects malformed/duplicate values, values materially in the past, and values beyond 365 days. The UI states explicitly that persistence does not imply automatic production dispatch and that an authorized manual dispatcher is required until Stage 6 attaches the exported entrypoint.

## Gate 4A transaction boundary

In-app dispatch calls the canonical Gate 4A producer with a campaign-derived deterministic event key, existing `NotificationAudience`, exact direct target, category/mandatory policy, typed destination, and localized fallback. A broadcast remains one Notification; no per-Person Notification rows are created for delivery reporting.

The campaign transition, deterministic in-app Notification, outbound recipient snapshot, mutation ledger, and Admin audit commit in one serializable database transaction. External provider calls never occur inside that transaction. A later claimed attempt performs the final eligibility recheck and persists its sanitized result in a separate authoritative transaction.

## Migration 38 and query evidence

Migration 38 adds:

- enums for campaign lifecycle, channel, delivery status, and attempt outcome;
- `CommunicationCampaign`;
- `CommunicationCampaignMutation`;
- `OutboundPreference` and `OutboundPreferenceMutation`;
- `OutboundDelivery`;
- `OutboundDeliveryAttempt`;
- nullable `Person.phoneVerifiedAt` with no historical verification backfill;
- permission-registry data backfill described above.

Retained evidence-driven indexes/constraints:

- campaign cursor/filter: `(status, createdAt, id)` and a general `(createdAt, id)` path;
- scheduled scan: `(status, scheduledAt, id)`;
- delivery due/claim: `(status, nextAttemptAt, id)`;
- expired lease: `(status, claimExpiresAt, id)`;
- campaign delivery listing/counters: `(campaignId, createdAt, id)` and `(campaignId, status, createdAt, id)`;
- exact-once delivery: unique `(campaignId, personId, channel)`;
- attempts: unique `(deliveryId, attemptNumber)` plus `(deliveryId, createdAt, id)`;
- preferences: unique Person ID;
- mutations: unique `(adminUserId, idempotencyKey)` and campaign/action/time lookup.

Only indexes supported by `EXPLAIN` evidence remain. Local rehearsal proved two fresh 1→38 deployments and one populated 37→38 upgrade; all 38 migrations were recorded, historical Notification content was preserved, and the three corrected delivery/attempt cursor indexes were present. Migrations 1–37 remain byte-for-byte unchanged. Real-staging application is recorded separately below. `prisma migrate reset`, staging `db push`, changes to migrations 1–37, and migration 39 are prohibited.

## Surface and DTO policy

The canonical Admin surface is `/admin/communications`, with cursor-paginated campaign list, bounded target search, draft editor, preview, scheduling/send/cancel, detail, safe delivery/attempt reporting, and authorized manual due dispatch. No template subsystem or visual redesign is in scope. `/admin/notifications` becomes a redirect.

Customer Web, Business Web, and Customer Mobile expose the same Person-owned outbound preference/version contract and endpoint eligibility. Business Mobile management and physical-device push claims are out of scope.

Strict inputs reject unknown or duplicate fields, malformed UUIDs/enums/cursors/timestamps, excessive page sizes, client actor/permission/recipient data, arbitrary links/HTML, credentials, and provider overrides. Stable domain errors are `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_CURSOR`, `STALE_VERSION`, `IDEMPOTENCY_CONFLICT`, `CAMPAIGN_NOT_EDITABLE`, `CAMPAIGN_CANCELLED`, `PROVIDER_NOT_CONFIGURED`, and `RATE_LIMITED`; raw Prisma/PostgreSQL/provider errors never cross the boundary.

DTOs include campaign summary/detail, audience preview, delivery/attempt summaries and pages, outbound preferences, endpoint eligibility, and dispatch result. They exclude contacts, push tokens, credentials, raw errors, `AdminAccess` internals, request hashes, sessions, recipient contact lists, and arbitrary metadata.

## Audit, test, and completion evidence

Every Admin mutation records actor, action, campaign, safe before/after status, audience, channel set, schedule, safe target, idempotency key, and bounded result. It never records copy, contacts, or provider payloads. Reporting distinguishes evaluated, eligible, enqueued, suppressed, missing endpoint, provider accepted, transient failure, permanent/not-configured failure, and cancelled; acceptance is never labelled confirmed delivery.

### Local validation evidence

- clean root and mobile installs completed; dependency audit reports no high or critical finding (the existing root/mobile advisories are moderate only and require breaking dependency changes, so no automatic audit rewrite was applied);
- Prisma format, validate, and generate passed;
- non-incremental root TypeScript, mobile TypeScript, ESLint with zero warnings, Expo dependency validation, Expo Doctor 20/20, Android export, and iOS export passed;
- production Next.js build passed and produced 69 static-generation entries plus the dynamic application routes;
- unit tests: 309/309;
- complete PostgreSQL integration tests: 277/277, including the Gate 4C authorization, snapshot, provider, retry, cancellation, and query-plan suite;
- production HTTP/RSC/API tests against `next start`: 81/81, including Admin campaign pages, legacy redirect, current revocation, and Customer Mobile outbound preferences;
- deterministic local fixture ran twice with identical SHA-256 fingerprint `0669236ae62f4f61fbdca6801d525c77ea2f2fffba5fe73032d2619be565fc9e`;
- local staging smoke proved 39 campaigns, a 24-row multi-page broadcast, 9 accepted sink attempts, transient/permanent/not-configured classification, suppression counts, all audience families, preference DTO safety, cursor pagination, audit redaction, and one canonical in-app event;
- `git diff --check` passed and migration 1–37 comparison against `origin/main` is empty.

### Security review

The final source/test review explicitly covered campaign IDOR, current permission and revocation checks, audience/recipient/SQL mass assignment, destination/open-redirect bypass, raw HTML/XSS, header/control injection, cross-Admin idempotency, stale writes, duplicate/double claim, retry amplification, lease ownership/recovery, cancellation races, preference/consent and mandatory-category abuse, endpoint/provider/PII leakage, staging-sink production guards, bounded fanout, and scheduler/rate-limit truthfulness.

Raw contacts are available only to the just-in-time endpoint resolver and provider call. The public preference DTO deliberately omits even the endpoint fingerprint; fingerprints remain internal to delivery revalidation. Provider results are runtime-sanitized before persistence. Audit metadata contains no campaign copy, contact, credential, raw payload, or raw error. The sink rejects production runtime and production/live database names. Fanout is capped at 5,000 and process-local rate limiting is documented as defense in depth rather than a distributed Stage 6 control. No P1 or P2 finding remains in the reviewed Gate 4C implementation.

### Real-staging and pull-request evidence

Pending the exact committed branch head. This section must record staging 38/38, both identical fixture runs, expanded staging smoke, unchanged Gate 4A/Gate 4B/Stage 3 fingerprints, exact Vercel SHA/Ready state, cleanup, CI, review remediation, and Ready-for-review conversion before the final verdict.

This document locks the Gate 4C policy baseline and evidence. Any material deviation must be justified by repository or staging evidence and updated here before review readiness.
