# Stage 4B Conversation and Messaging Lifecycle

Status: implemented and locally validated on 2026-07-18; remote staging and
exact-head PR evidence are recorded during closure.

Baseline: GitHub `origin/main` was verified directly at
`3ed161a95de8ae9e20d13effd82fedd1910e9709`, the merge commit for PR #117.
PR #100 remained Open, Draft, unmerged, and unchanged at
`e46454df993ecccb06180060dda4353ec88e2641`. The PR #117 exact-head staging
record confirms `rezno_staging` reached 36/36 migrations and completed cleanup.
The current GitHub main has not advanced beyond that closure.

## Architecture audit

### Persistence and participants

The existing `ConversationType` values are:

| Type | Existing intended participants | Existing ownership |
| --- | --- | --- |
| `CUSTOMER_BUSINESS` | one Customer Person and one Organization, optionally one Booking | Customer by `customerId`; Business by selected `businessId` |
| `ADMIN_USER` | one initiating Admin User and one Customer Person | exact `adminUserId` plus `customerId` |
| `ADMIN_BUSINESS` | one initiating Admin User and one Organization | exact `adminUserId` plus `businessId` |

`Conversation` has a nullable compound uniqueness constraint over
`businessId/customerId/bookingId`. It correctly makes a booking-linked
customer/business Conversation race-safe when all three values are non-null,
but PostgreSQL null semantics allow duplicate generic Conversations. Admin
Conversations have no identity uniqueness. There is no Commerce Order
Conversation relation or current Order messaging route; Gate 4B does not invent
one or overload `bookingId`.

`Message` stores sender User, text, creation time, and one nullable `readAt`.
That read timestamp is global. It cannot say that an Owner read a Message while
a Manager, Receptionist, or assigned Staff member did not. It also cannot bind
state to the selected Organization, membership, or current Role ID.

`Booking.memberId` is the current legal staff assignment. Restaurant
reservations are one-to-one Booking extensions, so the same Booking-linked
Conversation supplies restaurant messaging without a second Conversation
type. `OrganizationMember` binds Person, Organization, and Role; active
identity resolution already fails closed for inactive/deleted People,
memberships, Roles, and Organizations.

`AdminAuditLog` already supports Admin-scoped idempotency and sanitized JSON
results. `BusinessAuditLog` records Organization, actor membership/Person, safe
target and before/after state. Message sends currently write only Admin audit
events and do so outside the Message transaction.

### Routes, consumers, and writes

- `/customer/messages`, `/business/messages`, and `/admin/messages` render one
  shared page. It embeds up to 30 Customer/Business Conversations or 100 Admin
  Conversations, and the latest 10 Messages for every Conversation.
- The `conversationId` query parameter emitted by Gate 4A destinations and
  dashboard previews is ignored. The page renders every loaded thread.
- `markConversationRead` exists but no production component calls it. Page open
  does not currently mark even a selected Conversation read.
- Dashboard previews take one Message per Conversation. Their unread flag and
  all unread badges use global `Message.readAt`, so multi-reader counts are
  incorrect.
- Booking cards/details call `openBookingConversation`. The operation checks
  customer/Organization ownership and retries the booking uniqueness race, but
  it may create an empty Conversation and does not select it in the redirect.
- Customer general start requires a prior Booking with an active Organization,
  which is the correct anti-unsolicited relationship, but always creates a new
  Conversation and has no idempotency.
- Admin start embeds up to 200 People and 200 Organizations in HTML, always
  creates a new Conversation, and has no first-Message idempotency.
- Reply validates a 1-1,000 character trimmed body and uses a process-local rate
  limiter. It authorizes before the transaction, but does not lock the
  Conversation or revalidate the actor inside the write transaction.
- Duplicate form submits create duplicate Messages. Gate 4A Notifications use
  deterministic per-Message/per-recipient event keys, so one duplicate Message
  produces one additional, distinct Notification.
- Gate 4A removed raw Message bodies from notification copy. Current arrival
  copy is generic and direct, respects `messagesEnabled`, and has typed
  Customer/Business destinations. Reading a Message does not reconcile its
  Notification state, so arrival Notifications remain unread.
- Conversation UI shows sender email as a fallback and previews raw Message
  text. Message bodies belong in an authorized thread, but email is unnecessary
  in Customer/Business DTOs and list previews must be bounded.
- The Customer Mobile Messages tab currently hosts the Notification Center only.
  No Conversation list/history/send/read/count API exists.
- Next Server Actions are POST-only and authenticate inside each function;
  Better Auth has explicit trusted origins for Web, Vercel, and Expo. Gate 4B
  still treats every Server Action/Route Handler as directly callable and does
  not rely on form visibility for authorization.

### Required findings

1. The three existing Conversation types and participant bindings remain valid.
2. Booking uniqueness is sound; generic and Admin identities are not unique.
3. Customer, Owner/Manager, and initiating-Admin checks are server-derived.
4. One `Message.readAt` cannot safely model multiple Business readers.
5. Read is not wired to page opening or selected-thread opening.
6. Existing unread totals are incorrect for independent Business readers.
7. Fixed takes are 30 Conversations for Customer/Business, 100 for Admin, and
   10 Messages per Conversation.
8. No Conversation pagination exists.
9. No Message-history pagination exists.
10. Duplicate send creates duplicate Message rows and arrival events.
11. Booking find/create handles `P2002`; general/Admin starts are not race-safe.
12. Sender access is not revalidated under the Message write transaction.
13. Revoked memberships fail on the next identity resolution, but a revocation
    race can occur between preflight and current write.
14. Active-Business selection scopes queries, but read state/cursors do not bind
    that selection today.
15. Receptionist and Staff are wholly denied by the old Organization-wide
    policy, including operationally legal booking Conversations.
16. Admin Conversations are private to `adminUserId`; this isolation is kept.
17. Arrival Notifications are exact-once per Message, not per user intent,
    because Message creation itself is not idempotent.
18. Message reads do not reconcile Gate 4A Notifications.
19. Sender email is exposed as a display fallback and target dropdowns embed
    unnecessary Person sets; phone/address/coordinates are not queried.
20. Gate 4A canonical message copy no longer includes raw Message text.
21. Start/send rate limits are process-local (10/minute and 20/minute); Stage 6
    owns distributed limiting.
22. Authentication trusted origins and Next POST actions supply the existing
    Origin/CSRF boundary; every mutation still reauthorizes server-side.
23. Actions currently duplicate lifecycle rules; they must become thin wrappers
    over canonical services.
24. Commerce Order Conversations do not exist and are not required now.
25. Generic Customer/Business messaging is retained only after a prior Booking.
26. No current product operation requires shared `OPEN/CLOSED`; adding it would
    create ticket controls without a proven workflow. Gate 4B therefore does
    not add close/reopen or archive.
27. Migration 37 is required for per-scope read boundaries, exact send
    idempotency, canonical identity, and stable activity pagination.
28. Required indexes cover actor/activity Conversation scans,
    Message `(conversationId, createdAt, id)`, sender/idempotency uniqueness,
    and read-state actor/scope/boundary lookup. Plans are proved in rehearsal.
29. Gate 4C retains Admin composition hardening, scheduling, templates,
    outbound email/SMS/push, providers, delivery retries, and channel settings.
30. Gate 4D retains complete Stage 4 communications QA and final closure.

## Locked authorization policy

Every actor is derived from the authenticated session and transactionally
revalidated before reads or writes. Client actor, Person, Organization,
membership, Role, permissions, participants, and read owner fields are ignored
or rejected.

| Actor | `CUSTOMER_BUSINESS` | `ADMIN_USER` | `ADMIN_BUSINESS` |
| --- | --- | --- | --- |
| Customer | exact active `customerId`; linked Booking must still belong to them | exact active `customerId` | denied |
| Owner | active selected Organization, Organization-wide | denied | active selected Organization |
| Manager | active selected Organization, Organization-wide | denied | active selected Organization |
| Receptionist | booking-linked in selected Organization when current role can operate Bookings; generic denied | denied | denied |
| Staff | booking-linked only when current `Booking.memberId` equals current active membership | denied | denied |
| Admin | denied unless bound Admin type | exact `adminUserId` plus current permission | exact `adminUserId` plus current permission |

Owner and Manager read state is personal. Receptionist scope is the minimum
operational subset and does not grant generic or Admin/Business Conversations.
Staff assignment is resolved from the current Booking in the same authorization
query; stale prior assignment grants nothing. Role ID, membership ID, selected
Organization, and system role are embedded in Business cursor/read scope.

Admin list/detail/read requires `MESSAGES_VIEW`; start/reply requires
`MESSAGES_SEND`. Another Admin with either permission cannot enter a private
Conversation. Environment Super Admin still uses the same exact
`adminUserId` ownership; it does not imply Conversation takeover. Revoked,
suspended, or expired AdminAccess fails closed.

## Canonical identity and lifecycle

Canonical identity keys are:

- `customer-business:booking:<bookingId>`;
- `customer-business:general:<businessId>:<customerId>` after a prior Booking;
- `admin-user:<adminUserId>:<customerId>`;
- `admin-business:<adminUserId>:<businessId>`.

Migration 37 assigns canonical keys to the oldest matching legacy row and
preserves any duplicate legacy rows under `legacy:<conversationId>` without
deleting history. New start/open operations use the canonical key and a unique
constraint, so concurrency returns one Conversation. Starting with a first
Message is one atomic transaction; failure leaves no empty Conversation.

Messages are immutable text. Gate 4B adds no edit, delete, reaction, attachment,
presence, typing, assignment queue, archive, or shared close/reopen state.
Lifecycle is defined by canonical identity, current participant/source
validity, immutable Message delivery, read boundaries, and pagination.

## Message send and idempotency

Bodies normalize CRLF/CR to LF, trim outer whitespace, require a visible
non-control character, reject unsafe control characters and data URLs, preserve
safe line breaks, and are limited to 1,000 Unicode code points. UI renders text,
never raw HTML or executable Markdown.

Every first/reply send requires a UUID idempotency key. The canonical SHA-256
request hash binds action, sender User, actor Person/scope, Conversation,
normalized body, and legal source. `(senderUserId, idempotencyKey)` is unique.
Exact replay returns the originally stored Message DTO even after later sends;
changed replay returns `IDEMPOTENCY_CONFLICT`.

The Serializable transaction performs replay first, revalidates the actor and
Conversation source, obtains a Conversation row lock, creates one Message,
updates `lastMessageAt` once, writes exact direct Gate 4A events excluding the
sender, and writes an idempotent sanitized Admin audit when applicable.

## Per-scope read state and unread counts

`ConversationReadState` stores one scope-bound read-through tuple:
`(lastReadMessageCreatedAt, lastReadMessageId)`, plus optimistic version. A
Customer row binds Person; a Business row binds Person plus selected
Organization, membership ID, Role ID, and system role in `scopeKey`; an Admin
row binds Admin User. Exactly one Person/Admin owner is enforced by a database
check.

Mark-read updates one row to the latest authorized Message tuple. It does not
update every Message. Later tuples remain unread. A new role ID or membership
scope does not reuse stale state. `Message.readAt` remains for compatibility
but is non-authoritative.

Unread counts include only accessible Conversations and Messages from other
sender Users after the current read tuple. Counts are exact PostgreSQL
aggregates with no fixed account cap or N+1 access, and UI badges cap at `99+`.
The unread Conversation filter is an `EXISTS` query over the same scope and
tuple rather than an application-side scan.

Mark-read also reconciles only direct `message.received` Notifications for the
same Person, Conversation, and Message IDs through the boundary. It upserts
Gate 4A `NotificationRecipientState` as READ without calling public HTTP.
Later and unrelated Notifications, and every other Person's state, remain
unchanged.

## Pagination and DTO contracts

Conversation order is `(lastMessageAt DESC, id DESC)` and Message history order
is `(createdAt DESC, id DESC)`. Both use opaque versioned SHA-256 checksummed
cursors with a fixed snapshot. Conversation cursors bind actor, mode, active
Organization, membership, Role ID, system role, filters, and page size. Message
cursors additionally bind Conversation ID. Cross-actor, cross-role,
cross-Organization, cross-filter, or cross-Conversation reuse is
`INVALID_CURSOR`. Page sizes are 1-50.

Canonical DTO kinds are `CONVERSATION_SUMMARY`, `CONVERSATION_DETAIL`,
`MESSAGE_SUMMARY`, `MESSAGE_PAGE`, `MESSAGE_SEND_RESULT`, and
`MESSAGE_UNREAD_COUNT`. They expose only safe labels, source context, bounded
preview, timestamps, own-message flag, unread data, and authorized controls.
They omit contact data, coordinates, instructions, User email, session/admin
grants, membership internals, notification metadata, request hashes, and keys.

## Web, Admin targets, and Customer Mobile

Customer, Business, and Admin Web use one canonical list/detail service. Only a
selected authorized Conversation is marked read. Lists and histories paginate;
filters support all/unread/booking/Admin as applicable. UI remains within the
existing design and supports AR/EN/CKB plus RTL/LTR.

Admin target selection becomes bounded search; the page no longer embeds 200
People and Organizations. Admin announcement composition is unchanged.
`/business/communications` marks Messaging functional while outbound delivery
remains truthfully pending Gate 4C.

Customer Mobile receives authenticated no-store list/detail/history/send/read/
count/start endpoints with strict unknown-field and duplicate-query rejection,
stable errors, UUID idempotency, and the same DTOs. The native Messages tab
offers Conversation list/thread navigation alongside the Gate 4A Notification
Center. Business Mobile is excluded.

## Legacy cleanup, migration, and evidence

Production Server Actions and Route Handlers are thin wrappers. One canonical
service owns booking open, Customer/Admin first Message, reply, read, list,
history, and count. No reachable write bypasses transaction-time authorization,
idempotency, hashing, locking, or arrival notifications.

Migration 37 is forward-only; migrations 1-36 are immutable. It preserves
legacy `Message.readAt`, creates no synthetic read claims, and never deletes a
Conversation or Message. Required closure evidence is 36→37 and fresh 1→37,
existing-data preflight, query plans, deterministic fixture twice, exact-head
staging, complete local/HTTP/mobile regression, and explicit security review.

### Local validation and migration evidence

- Clean root and Mobile installs completed. Prisma format, validation, client
  generation, TypeScript, ESLint, and `git diff --check` pass.
- Fresh PostgreSQL applied all 37 migrations and reports the schema up to date.
- The 36→37 rehearsal first applied migrations 1-36, inserted seven legacy
  Conversations (booking, generic duplicates, Admin/User duplicates, and
  Admin/Business duplicates) plus five Messages, then applied only migration
  37. All rows and the historical `readAt` survived. Oldest rows received the
  canonical keys, duplicates received `legacy:<conversationId>`, and every
  `lastMessageAt` matched the latest Message or Conversation creation time.
- Full regression passed: 290 unit, 255 PostgreSQL, and 76 production
  HTTP/RSC/API tests (`621/621`). Focused Gate 4B coverage is 7 unit, 14
  PostgreSQL, and 4 production HTTP/RSC/API tests.
- Next 16.2.9 production build passes. Expo dependency validation passes,
  Expo Doctor passes 20/20, Mobile TypeScript passes, and Android/iOS Hermes
  exports both complete. Physical-device QA remains explicitly unperformed.
- The deterministic fixture produced the same SHA-256 fingerprint twice:
  `387d550b8a89ed63f287ff816e2d5715aed2e36f91cae7c3eb4019e280d25966`.
  It contains 12 Users, 12 People, seven memberships, three Admin identities,
  26 Conversations, 61 Messages, three read states, two Notifications, and one
  Admin audit row. Its expanded local role smoke passed Customer send/replay,
  Owner, Manager, Receptionist, assigned Staff, full Admin User/Business sends,
  read-only Admin denial, second-Admin isolation, unassigned/foreign/revoked/
  inactive denial, active-Business scope enforcement, two-page Conversation
  and Message pagination, cross-scope cursor rejection, personal read state,
  post-read unread behavior, exact-once generic Notification delivery, PII/body
  absence, and unchanged Stage 3A/3B/3C/3D and Gate 4A fixture fingerprints.
  A third seed restored the exact deterministic baseline after the smoke.

### Query-plan evidence

`EXPLAIN (ANALYZE, BUFFERS)` was run against the deterministic PostgreSQL
fixture. Customer Conversation pagination used
`Conversation_customerId_lastMessageAt_id_idx` (`0.103ms`); Message history
used an index-only backward scan on
`Message_conversationId_createdAt_id_idx` (`0.013ms`); Notification
reconciliation used the unique `Notification_eventKey_key` (`0.022ms`).
Business/Admin lists, unread aggregation/filtering, read-through lookup, and
bounded Admin target search chose sequential/hash plans because the fixture
contains only 26 Conversations, 61 Messages, and small target tables; their
measured execution times were `0.008–0.130ms`. The actor/activity, Message
tuple, idempotency, and read-state indexes required for larger cardinalities
exist. No speculative trigram index was added for the bounded Admin contains
search.

Managed attachments remain Stage 5. Distributed limiting/workers remain Stage
6. Physical-device and release QA remain Stage 7 and are not claimed. Visual
redesign remains Stage 8. AI remains after Stage 8. Gate 4C and Gate 4D have not
started.

## Security verdict

The local review found no open P1/P2. Production writes resolve to one canonical
service and revalidate the current actor inside Serializable transactions.
IDOR, active-Business, revoked membership/assignment, private Admin ownership,
cursor scope, changed replay, duplicate/concurrent send, per-Person read state,
mass assignment, mobile mutation origin, XSS escaping, raw-error suppression,
and target bounds have executable regression coverage. DTOs and Notification
copy omit email, phone, address, coordinates, Message text, idempotency keys,
hashes, permissions, and database internals. Fixture errors never print the
database URL and no credential is stored in the worktree.

Accepted non-blockers are the documented process-local rate limiter (Stage 6
owns distribution), bounded unindexed Admin contains-search at current scale,
and existing dependency-audit Moderate findings. Root reports five Moderate
and Mobile ten Moderate transitive/direct-chain findings, with no High or
Critical; the offered audit remediations are incompatible major Next/Prisma or
Expo changes and are not a Gate 4B security fix. Gate 4C/4D functionality is
absent, and PR #100 and the protected checkout remain outside scope.
