# Gate 4A Notification Center

Status: architecture audit completed before implementation on 2026-07-18.
Implementation, migration, validation, and exact-head staging evidence are
recorded in the later sections of this document as the gate progresses.

Baseline: `origin/main` was
`cf472bcb90e6f7b7b0e08391ad729e3d2d5323c7`, the merge commit for PR #116.
The repository and `rezno_staging` both contained 34 applied forward-only
migrations. PR #100 remained an unrelated Open Draft at
`e46454df993ecccb06180060dda4353ec88e2641`.

## Mandatory architecture audit

### Existing schema and identity boundaries

`Notification` currently stores one title/body, audience, priority, optional
globally unique event key, arbitrary metadata, optional direct Person,
optional Organization, optional creating Admin User, and creation time. It has
audience/time, Person/time, and Organization/time indexes. It has no category,
stable event type, typed source, typed destination, localization contract,
expiration, recipient state, inbox watermark, interaction ledger, or
preference relationship.

`Person` is the canonical notification identity. `OrganizationMember` binds a
Person to one Organization and a current `Role.systemRole`. Business identity
resolution already requires the selected active Organization, active
membership, active Person, and active Organization. Gate 4A must derive all of
those server-side and must never accept Person, membership, role, or
Organization scope from a mutation/query client.

`BookingStatusHistory`, `BookingChangeRequest`, restaurant mutation/history,
and `OrderStatusHistory` are authoritative domain ledgers. They cannot carry
per-Person inbox state and must not be modified by notification backfill.
`Conversation` and `Message` remain Gate 4B lifecycle owners; Gate 4A may only
normalize the already-existing message-arrival notification side effect.
`AdminAuditLog` and `BusinessAuditLog` are domain audit ledgers, not suitable
notification-interaction idempotency stores.

Migration 35 is required. Per-Person state, scoped mark-all watermarks,
preference state, exact interaction replay, typed event/source/destination
fields, and their proved indexes cannot be represented safely by migration 34.
Migrations 1–34 remain immutable.

### Producer inventory before Gate 4A

| Producer | Recipient/event key | Copy and destination | Boundary and risk |
| --- | --- | --- | --- |
| Admin announcement action | ALL/CUSTOMERS/BUSINESS_OWNERS/RESTAURANTS/BUSINESS/USER; no event key | literal Arabic-capable title/body; Notification Center fallback only | create and Admin audit are separate; retry can duplicate |
| Generic customer Booking creation | no Notification | none | Booking and history are transactional, but the feed is synthesized later |
| Generic customer cancellation/reschedule/change request | no canonical Notification in customer services | none | history/request is authoritative; retries do not duplicate domain rows, but no event exists |
| Business Booking status/cancellation/proposal/response | direct customer; operation-derived event key only for cancellation/proposal/response | fixed Arabic copy; Booking fallback in metadata | inside domain transaction; create can throw on duplicate rather than no-op |
| Restaurant customer create/cancel/reschedule | Organization broadcast with deterministic event key | English literal text; metadata Booking ID | inside transaction; customer names or exact instants may enter body/history |
| Business Restaurant reschedule | direct customer with operation key | fixed Arabic copy | inside transaction; duplicate unique key is not normalized to a no-op |
| Review creation | Organization broadcast; no event key | English literal body includes customer snapshot, service and rating | inside transaction; retry/concurrency relies on Review uniqueness but notification has no exact key |
| Review request | no Notification | synthesized from completed Booking history | not independently stateful or paginated |
| Commerce Checkout/Order lifecycle | direct customer and eligible active merchant People; deterministic per-event/per-recipient key | AR/EN/KU literal fallback plus localization keys and generated destinations | inside transaction, `createMany(skipDuplicates)`; strongest existing producer |
| Store moderation | direct eligible Admin/Owner People; deterministic Store/event/version/recipient key | AR/EN/KU literal fallback; generated Admin/Business destination | inside transaction, `createMany(skipDuplicates)` |
| Message arrival | BUSINESS or USER; no event key | Arabic title and first 160 characters of raw message body | message and notification share a transaction, but retries can duplicate and body content must not be copied |
| Invitations/onboarding/security | no current Notification producer | none | future ACCOUNT events may use the contract; no producer is invented in this gate |

No production notification producer currently writes phone, address, token,
cookie, authorization header, or database URL. Restaurant/Review producers do
embed customer names, and Message producers embed raw message text. Those
fields are removed from canonical notification payloads.

### Consumers before Gate 4A

- `/customer/notifications` and `/business/notifications` call
  `getDashboardNotifications(role, 40)`.
- That service independently loads `BookingStatusHistory`, pending
  `BookingChangeRequest`, and `Notification`, sorts the three arrays in memory,
  and truncates them. It is fixed-take, not cursor-paginated, and cannot provide
  stable state or totals.
- The customer feed admits ALL, CUSTOMERS, and direct USER. The business policy
  admits ALL/direct USER; OWNER adds BUSINESS_OWNERS; Owner/Manager/Receptionist
  add the selected Organization's BUSINESS and RESTAURANTS when appropriate.
  Staff receives only ALL and direct USER, which is retained.
- Dashboard/header previews reuse the same synthetic service. The business
  overview counts visible Notification rows, not unread Person state. There is
  no canonical customer/business unread badge.
- The mobile application has a Commerce-only notification API and screen. It
  scans direct Commerce Notification rows, validates owned Orders, and maps only
  Commerce Order destinations. General Booking, Restaurant, Message, Admin
  announcements, state mutations, filters, counts, and preferences are absent.
- Admin notification history is a fixed 50-row list. Gate 4A preserves its
  composition UI and makes its created rows compatible; composition hardening,
  scheduling, outbound channels, and delivery remain Gate 4C.
- Existing message pages and conversation access policy remain unchanged for
  Gate 4B.

### Required findings

1. Current Notification cannot represent read/archive independently for two
   People who see the same broadcast row.
2. Broadcast rows must remain single Notifications; direct rows use USER plus a
   Person. Per-Person state belongs in a separate sparse table.
3. Booking notifications are currently synthetic and therefore lack event keys,
   state, stable pagination, and a common destination contract.
4. Commerce already creates direct per-recipient rows and has deterministic
   keys, but its metadata destination is not the system-wide typed contract.
5. Admin announcements are shared audience rows with literal title/body and no
   replay key. Their composition UI remains unchanged apart from compatibility.
6. Message-arrival notifications are transactional but duplicate-prone and copy
   raw message content.
7. Read, unread override, archive, and restore do not exist.
8. Mark-all and a snapshot/watermark do not exist.
9. Web lists are fixed and in-memory merged; central/mobile pagination is split.
10. No in-app preference model or preference history exists.
11. Arbitrary metadata paths are not a typed, role-authorized destination
    contract.
12. Admin, Review, and Message retries can create duplicate Notifications.
13. Commerce, Store, restaurant, and some Business operations have keys;
    synthetic histories, Review, Message, and Admin announcements do not.
14. Revoked/inactive memberships are excluded by current business identity, but
    historical direct USER rows remain Person-owned.
15. Role changes immediately change Organization audience visibility. Sparse
    state remains Person-specific and never transfers between members.
16. Active-Business selection currently scopes business Notification queries and
    must be part of cursor and mark-all scope fingerprints.
17. Deleted/inactive People must fail before all queries and mutations.
18. Existing fixed takes are 8/40/50/200 and are not scalable inbox contracts.
19. Mobile is Commerce-only and lacks general inbox state.
20. Historical synthetic Booking/Restaurant/review-request items require a
    guarded canonical backfill; a permanent compatibility merge would retain two
    inconsistent feeds.
21. Migration 35 is required.
22. Required indexes are Notification category/time and source, sparse
    Person/state access, scoped watermarks, interaction keys, and preference
    lookup. Only plans that prove use are retained.
23. Conversation/message lifecycle, pagination, assignment, close/reopen,
    attachments, realtime, typing, and presence remain Gate 4B.
24. Admin composition redesign, scheduling, email/SMS/push, workers, retries,
    channel preferences, and provider credentials remain Gate 4C.

## Locked Gate 4A architecture

### Canonical event contract

Every new user-visible event is a canonical Notification with category, stable
event type/key, priority, audience/direct/Organization scope, typed source,
typed internal destination plus optional UUID target, fallback title/body,
optional localization keys, bounded sanitized variables, occurred time, optional
expiration, and a mandatory/optional delivery policy. Event keys bind the source
event, recipient scope, and direct recipient where applicable.

Operational copy uses AR/EN/KU fallback strings and bounded localization
variables. Admin announcements retain their literal title/body. Raw customer
names, phone/address/instructions, message bodies, credentials, exception text,
and arbitrary destination strings are forbidden.

### Recipient policy

- Customer: ALL, CUSTOMERS, and direct USER for the active Person.
- Owner: ALL, direct USER, BUSINESS_OWNERS, selected Organization BUSINESS, and
  RESTAURANTS for a selected Restaurant/Cafe.
- Manager: ALL, direct USER, selected Organization BUSINESS, and matching
  RESTAURANTS.
- Receptionist: ALL, direct USER, selected Organization BUSINESS, and matching
  RESTAURANTS, preserving the current operations policy.
- Staff: ALL and direct USER only. Assigned events are emitted directly; Staff
  never inherits every Organization event.

All business queries revalidate Person, selected Organization, membership,
role, Organization activity, and effective permissions. Revocation immediately
removes Organization rows. Direct historical rows remain visible only to their
active recipient Person.

### Read, archive, and mark-all state

`NotificationRecipientState` is sparse and unique per Notification/Person. It
stores an explicit READ/UNREAD override with its own change timestamp, archive
timestamp, and optimistic version. One member never mutates another member's
row.

`NotificationInboxState` is unique per Person and server-derived scope key
(`customer` or the selected business membership/Organization/role scope). It
stores a read-through Notification timestamp, the mark-all mutation time, and a
version. Effective read state is:

1. a later explicit read/unread override;
2. otherwise notification time at or before the scoped read-through watermark;
3. otherwise unread.

This makes a later mark-all supersede earlier unread overrides without touching
every Notification, while a later mark-unread reverses it. Mark-all binds one
exact visible snapshot; events after it remain unread. Archive is independent
and default inboxes exclude archived rows.

`NotificationInteraction` is a dedicated Person-scoped replay ledger. UUID key,
action, target/scope, expected version, canonical request hash, and safe result
are bound transactionally. Exact replay returns the original result; changed
replay conflicts; stale versions conflict; no domain audit ledger is reused.

### Preferences

One versioned preference profile belongs to each Person. BOOKINGS, RESTAURANT,
COMMERCE, MESSAGES, and ADMIN_ANNOUNCEMENT optional events can be disabled;
ACCOUNT/security cannot be disabled. Explicit mandatory operational events also
ignore an optional-category disable. Direct producers consult the profile before
creating optional events. Broadcast visibility uses bounded preference
suppression intervals, so a change affects only events occurring while disabled
and never deletes or retroactively hides older history.

Outbound email/SMS/push preferences are absent by design and remain Gate 4C.

### Destination security

Destinations are enums, never arbitrary paths. The serializer maps an allowed
kind and UUID target to an existing Customer, Business, or Admin route only
after current ownership/tenant/role authorization. Absolute/protocol-relative
URLs, javascript/data schemes, encoded traversal, malformed IDs, foreign
targets, inaccessible role routes, and legacy arbitrary metadata all fall back
to the current Notification Center. Mobile maps the same DTO kind/target to its
existing navigation model.

### Historical strategy

A guarded, batched, resumable backfill converts current synthetic customer and
business Booking histories, pending Booking change requests, and completed
Booking review requests into canonical rows with deterministic source-based
keys. Restaurant histories use the RESTAURANT category. It never updates or
deletes histories, bookings, change requests, Orders, or snapshots. Resolved
change requests are not synthesized separately because the current consumer
exposes only pending requests; their resulting Booking histories remain the
historical record.

After backfill, Web/dashboard/mobile read only the canonical Notification
service. The backfill has dry-run, staging/production target gates, bounded
batches, progress cursors, before/after counts, idempotent rerun, and PII-free
logging.

## Implementation and evidence

### Canonical persistence and contracts

Migration 35 adds canonical category, event type, source, destination,
localization, occurrence/expiration, and mandatory fields to `Notification`.
It canonicalizes all existing rows in place without modifying a domain ledger.
The migration adds:

- `NotificationRecipientState`, unique by Notification/Person;
- `NotificationInboxState`, unique by Person/server-derived scope;
- `NotificationInteraction`, unique by Person/idempotency key;
- `NotificationPreference`, unique by Person;
- `NotificationPreferenceSuppression`, an interval ledger for broadcast
  preference semantics.

The producer validates strict React-independent event objects, rejects unsafe
UUID/scope/localization data, consults direct-recipient preferences, and writes
with `createMany(skipDuplicates)` inside the caller's domain transaction.
Compatibility metadata contains only typed identifiers and generated internal
routes; it does not accept a caller-provided path.

The query layer revalidates an active Person and, for Business mode, the exact
active membership, Organization, role, and Organization state before reading.
It uses one snapshot-bound `createdAt DESC, id DESC` cursor, a checksum and a
scope/filter/page-size fingerprint. All/read/unread/important/archived,
category, and bounded date filters share the same canonical source. The unread
count is scoped and capped at 100,000 rather than depending on preview length.

### Producer normalization result

- Generic Booking creation now emits one Organization event and direct events
  for eligible assigned Staff and the customer. Cancellation, change-request,
  status, proposal, and response paths emit deterministic canonical events
  inside their existing transactions.
- Restaurant creation, cancellation, and reschedule emit separate deterministic
  Business and customer rows. Business lifecycle updates retain direct customer
  delivery. Copy no longer includes customer names or instructions.
- Commerce Order and Store/Product moderation retain their existing event-key
  policies, AR/EN/KU fallbacks, recipient calculation, and transactional
  boundaries while using the canonical producer and typed destinations.
- Review creation emits one deterministic Organization event without customer
  or service snapshots. Completed Booking review requests are backfilled and
  new completion events direct the customer to the Booking.
- Existing customer/business message-arrival side effects now use one
  deterministic key per Message/recipient, direct eligible recipients, and
  generic copy that never includes raw message text. Conversation lifecycle was
  not changed.
- Existing Admin composition remains unchanged in scope. Created announcements
  now have a canonical key/source/category/fallback destination, preserve their
  literal title/body, and participate in state, count, preference, and audience
  policy. Composition idempotency/scheduling/outbound delivery remain Gate 4C.

Repository-wide production search leaves `notification.createMany` only in the
canonical producer. Direct writes that remain are prior deterministic staging
fixtures and tests, not production producers.

### Web and mobile contracts

`/customer/notifications` and `/business/notifications` now render canonical
filters, unread count, category/mandatory badges, safe links, cursor continuation,
read/unread, archive/restore, mark-all, and per-Person preferences. The same
component retains AR/EN/KU copy and visible mutation notices. The customer and
Business layouts and dashboard previews use the exact canonical unread count,
with display capped at `99+`.

`/business/communications` exposes Notifications as functional, labels
Messaging as Gate 4B pending, and labels outbound delivery as Gate 4C pending.
No deferred Message workflow was implemented.

The authenticated customer mobile contract is:

- `GET /api/mobile/notifications`
- `GET /api/mobile/notifications/count`
- `PATCH /api/mobile/notifications/:id/state`
- `POST /api/mobile/notifications/mark-all-read`
- `GET|PATCH /api/mobile/notifications/preferences`

Every response is `no-store`; mutation bodies and UUID idempotency headers are
strict. The mobile screen supports the canonical filters, pagination, state,
mark-all, preferences, AR RTL, English/Kurdish, and typed destination mapping.
The Home badge uses the exact count. Business Merchant Mobile is not added.

### Historical backfill and deterministic fixture

The guarded backfill supports dry-run and explicit apply confirmation, batches
from 1–1,000, deterministic source keys, rerun-as-resume, production double
confirmation, and staging/test database-name enforcement. It handles every
historical Booking status, pending Booking change request, and completed
unreviewed Booking. It fingerprints Booking, status-history, change-request,
and Review ledgers before and after.

Local rehearsal against migration 35 with batch size 1:

| Run | History | Pending change | Review request | Created | Domain changed |
| --- | ---: | ---: | ---: | ---: | --- |
| Dry run | 2 | 1 | 1 | 0 | no |
| Apply 1 | 2 | 1 | 1 | 4 | no |
| Apply 2 | 2 | 1 | 1 | 0 | no |

The fixture marker is exactly `rezno-qa-notification-center-stage4a`; execution
requires `REZNO_NOTIFICATION_STAGE4A_FIXTURE`. It preflights every deterministic
ID for namespace ownership, deletes only its own rows, and uses one serializable
transaction. Both local runs produced the identical fingerprint
`252f14499ff9fbd373e86755c2ae0e94cb6b04b68eac5b784e38dbc5988eef79` with
10 People, 3 Organizations, 8 memberships, 34 Notifications, 2 histories, and
1 pending change request.

### Migration and performance evidence

Both upgrade and fresh paths were rehearsed without `migrate reset`:

- an existing local database at 34/34 applied only migration 35 and reached
  35/35;
- a fresh local database deployed migrations 1 through 35 and reached 35/35;
- the stage-4A schema has no generated migration drift. The only reported
  differences are five pre-existing migration/schema differences owned by
  prior gates (Booking FK action, BranchService update default, Business audit
  defaults, and a Restaurant index name); migration 35 does not rewrite them.

Representative PostgreSQL plans, with sequential scan disabled only to prove
index eligibility on the deliberately tiny fixture, used:

- `Notification_recipientPersonId_createdAt_id_idx` for direct inbox/count;
- `Notification_businessId_audience_createdAt_id_idx` for Business/audience
  scans;
- `Notification_category_createdAt_id_idx` for category filtering;
- `NotificationRecipientState_personId_archivedAt_notification_idx` for archive;
- `NotificationRecipientState_notificationId_personId_key` for one state;
- `NotificationInboxState_personId_scopeKey_key` for mark-all state;
- `Notification_sourceType_sourceId_idx` for backfill/source lookup.

The list reads IDs first, fetches one bounded page, loads state in one query,
and authorizes destination targets in three batched queries (Booking, Order,
Conversation); there is no per-row N+1. Unread count has a hard 100,000-row
bound and page size is 1–50.

### Local validation evidence

The following evidence is complete locally as of 2026-07-18:

- root clean install and Prisma client generation: passed (5 existing moderate
  dependency advisories reported by npm);
- root ESLint: passed;
- root non-incremental TypeScript: passed;
- Prisma format, validate, and generate: passed;
- focused Gate 4A unit/contract tests: 10/10;
- focused Gate 4A PostgreSQL tests: 11/11;
- complete unit suite: 269/269;
- complete PostgreSQL integration suite: 240/240;
- complete production HTTP/RSC/API suite: 72/72;
- focused Gate 4A production HTML/RSC/API suite: 3/3, including active-Business
  switching, revoked membership, inactive Person, post-snapshot unread state,
  preference suppression, and mandatory delivery;
- complete local regression total: 581/581;
- Next production build: passed;
- mobile TypeScript: passed;
- Expo dependency check: passed;
- Expo Doctor: 20/20;
- Android export: passed;
- iOS export: passed;
- deterministic fixture twice: passed with identical fingerprint;
- backfill dry run/apply/apply: 0/4/0 created, protected ledgers unchanged.

Exact-head CI/Vercel, real staging migration/backfill/fixture/role smokes, and
cleanup are recorded after their final runs. No staging or physical-device
claim is inferred from local export evidence.

### Security review

The service derives Person and Business scope server-side and revalidates it in
queries and mutations. State rows, inbox watermarks, preferences, interactions,
and cursor scope all bind the Person; Business scope additionally binds selected
Organization, membership, and role. Cross-Person state mutation returns
not-found, revoked/inactive identity fails closed, Staff is direct-only, and
role/Organization cursors cannot be reused.

Strict action schemas reject mass assignment. Interaction hashes bind action,
target, expected version, Person, and scope. Destination enums and ownership
lookups neutralize open redirects, protocol schemes, malformed targets, and
foreign routes. Localization variables reject PII/secret-bearing keys and are
bounded; message/customer snapshot content is absent from canonical events.
API errors map to stable codes and generic 500 text; rate limits and no-store
headers remain in force. Fan-out is bounded to explicit active recipients and
broadcasts remain one row. No production mock fallback exists.

No P1/P2 security issue remains in local review. Real-staging security and
cross-role evidence remain required before the Draft PR is marked Ready.

## Deferred boundaries

Gate 4B retains all Conversation and Message lifecycle work. Gate 4C retains
Admin communications composition hardening and every outbound delivery channel.
Gate 4D remains Stage 4 closure. Stages 5–8 and post-Stage-8 AI ownership are
unchanged.
