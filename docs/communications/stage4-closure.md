# Stage 4 Communications Closure

Status: Gate 4D audit recorded before remediation on 2026-07-19. Stage 4 is
not complete: this Gate 4D pull request must still pass independent review,
exact-head automation, merge, and post-merge `main` verification.

Verified baseline:

- repository: `aswad7022/REZNO`;
- `origin/main`: `cb314be8bc267f8d1d62a6b725a3a1e6503184ac`;
- PR #119: merged from exact head
  `a39fc683091dcb6b2a01090f55d5b37d8af9b76c` as the baseline commit above;
- PR #118 and PR #117: merged;
- PR #100: Open, Draft, unmerged, and protected at
  `e46454df993ecccb06180060dda4353ec88e2641`;
- repository migrations: 38, with no migration 39;
- isolated worktree: `rezno-stage4-closure`, branch
  `feat/stage4-communications-closure`, starting divergence `0/0`;
- production Email, SMS, and Push providers: `NOT_CONFIGURED`;
- scheduling: persisted schedules plus authorized manual dispatcher/CLI only;
- physical-device QA: not performed;
- Stage 5: not started.

This first part is the mandatory production-reachable architecture audit. It
describes the accepted 4A/4B/4C implementation as found on `main` and records
closure defects before any Gate 4D remediation.

## Executive architecture

Stage 4 is one Person-centered communications system with three canonical
write domains:

1. Gate 4A owns user-visible `Notification` events, per-Person read/archive
   state, scoped mark-all watermarks, interaction replay, in-app preferences,
   destination authorization, and the Web/Mobile Notification Center.
2. Gate 4B owns canonical `Conversation` identities, immutable `Message`
   delivery, sender-scoped idempotency, per-participant read boundaries,
   message-arrival Notification reconciliation, and Web/Admin/Mobile
   messaging.
3. Gate 4C owns Admin `CommunicationCampaign` lifecycle, mutation replay,
   audience preview/snapshot, Person-owned outbound preferences, immutable
   Delivery/Attempt evidence, provider-neutral manual dispatch, and Admin
   reporting. In-app campaigns call the Gate 4A producer instead of creating
   another notification model.

Session identity is resolved to a current active Person on the server.
Business scope additionally binds the selected active Organization, current
membership, current Role row, and system role. Admin scope binds the current
Person/User and a current database grant or current environment-super-Admin
allowlist result. Client actor, Person, Organization, membership, Role,
permission, sender, audience SQL, endpoint, or provider input is never
authoritative.

## Production write-path inventory

| Domain | Reachable entry points | Canonical transaction owner | Durable effects |
| --- | --- | --- | --- |
| Notification state | Web inbox Server Actions; Mobile Notification state route | `interaction-service` Serializable transaction | one Person's sparse read/unread/archive state plus `NotificationInteraction` replay row |
| Notification mark-all | Web action; Mobile mark-all route | `interaction-service` Serializable transaction | one Person/scope watermark plus replay row; no per-row mass update |
| In-app preferences | Web action; Mobile preferences route | `interaction-service` Serializable transaction | one Person profile, suppression intervals, replay row |
| Canonical Notification events | Booking, Restaurant, Review, Commerce, Store moderation, Message arrival, Admin campaign | `createCanonicalNotifications` inside the caller's domain transaction | conflict-safe rows keyed by the canonical event identity |
| Historical Notification backfill | guarded manual backfill CLI only | batched transaction using the canonical producer | deterministic historical rows; source ledgers remain immutable |
| Booking conversation open | Booking Web actions and canonical messaging service | `delivery-service` Serializable transaction | one canonical booking Conversation; no Message unless explicitly sent |
| Customer first Message | Web action; Mobile conversation-start route | `delivery-service` Serializable transaction | canonical generic Conversation plus one Message, arrival Notifications, activity timestamp |
| Admin first Message | Web action; Mobile has no Admin writer | `delivery-service` Serializable transaction | private Admin/User or Admin/Business Conversation, Message, Notifications, sanitized Admin audit |
| Message reply | Web action; Mobile message route | `delivery-service` Serializable transaction | one idempotent Message, activity update, exact arrival Notifications, optional Admin audit |
| Conversation read | selected Web thread marker; Mobile read route | `conversation-read` transaction | one actor-scope read boundary and matching Person Notification reconciliation |
| Outbound preference | Customer/Business Web component; Mobile outbound-preference route | `preferences` Serializable transaction | one Person profile plus exact mutation replay |
| Campaign create/update/schedule/send/cancel | Admin Web Server Actions | `campaigns`/`dispatcher` Serializable transactions | campaign/version transition, exact mutation ledger, one sanitized Admin audit |
| Campaign in-app send | Admin send-now service | same campaign transaction calling Gate 4A producer | one canonical campaign Notification, never per-Person duplicates |
| Outbound snapshot | Admin send-now service | dispatcher enqueue transaction | unique campaign/Person/channel Deliveries with no raw endpoint |
| Manual dispatch | authorized Admin action or explicit CLI | bounded claim/process/finalize transactions | leases, unique attempts, sanitized provider result, retry/final state |
| Expired claim recovery | explicit dispatcher invocation only | dispatcher transaction | deterministic abandoned attempt finalization and recoverable Delivery state |

There is no production-reachable alternate Notification, Message, Campaign,
Delivery, or Attempt writer. The old Admin Notification action is disabled and
the old route redirects, but its unused form and fixed-list service remain dead
source at the audit point and are classified below.

## Production read-path inventory

| Surface | Canonical reads | Bounds |
| --- | --- | --- |
| Customer Web | Notification list/count/preferences/outbound preferences; Conversation list/detail/history/unread | Notification, Conversation, and Message pages 1–50 with fixed snapshots |
| Business Web | same personal reads plus active-Organization authorization | selected Organization/membership/Role is rebound on every request |
| Admin Web | private Admin Messages; campaign list/detail, Delivery/Attempt reports, target search | page size at most 50; target search at most 20; no contact fields |
| Customer Mobile | Notification list/count/preferences/outbound preferences and Message list/detail/history/count | authenticated no-store routes, strict bounded queries |
| Dashboards/badges | canonical Notification unread count and Message unread aggregate | Notification count capped at 100,000; UI badges display `99+` |
| Notification destinations | batched Booking, Order, and Conversation authorization | only current typed internal route; fallback is the current center |
| Audience preview | active People/membership set plus bulk endpoint resolution | 5,001 detection row, 5,000 hard fanout ceiling, five sampled Person UUIDs |
| Campaign reporting | campaign, delivery, attempt page services | authenticated v2 cursor and current Admin permission before decode |

## Actor and authorization matrix

| Actor | Notifications | Customer/Business Conversations | Admin Conversations | Campaigns |
| --- | --- | --- | --- | --- |
| Customer | own direct plus legal Customer broadcasts | exact active `customerId`; Booking must remain owned | exact `ADMIN_USER` Customer side | none |
| Owner | own direct, ALL, owner, active Organization and Restaurant audiences | active selected Organization, Organization-wide | Customer side of exact `ADMIN_BUSINESS` scope | none |
| Manager | own direct, ALL, active Organization and Restaurant audiences | active selected Organization, Organization-wide | Customer side of exact `ADMIN_BUSINESS` scope | none |
| Receptionist | own direct, ALL, active Organization and Restaurant audiences | booking-linked operational subset only | denied | none |
| Staff | own direct and ALL only | booking-linked only while current `Booking.memberId` is their current membership | denied | none |
| Admin view | no implicit Customer/Business inbox | denied | own private conversations with `MESSAGES_VIEW` | list/detail/report with `NOTIFICATIONS_VIEW` |
| Admin send | same | denied | own private send with `MESSAGES_SEND` | create/mutate/send with `NOTIFICATIONS_SEND` |
| Admin dispatch | same | denied | permission-independent | manual due dispatch with transitive view/send/dispatch grant |
| Environment Super Admin | current Person plus current allowlist result | denied | still exact initiating Admin User only | audited current permission closure; no Conversation takeover |
| Revoked/inactive/foreign identity | denied | denied | denied | denied |

Business cursor/read scopes include current membership and Role identity, so
role replacement or membership revocation does not inherit old state. Admin
services recompute the current grant before reading, mutation, cursor decode,
or dispatch. Button visibility is never treated as authorization.

## State ownership and reconciliation

- `NotificationRecipientState`: one sparse row per Notification/Person. Read
  and archive are independent.
- `NotificationInboxState`: one Person plus server-derived inbox scope.
  Mark-all advances a read-through snapshot without touching each row.
- `NotificationInteraction`: exact replay ledger for state, mark-all, and
  in-app preference mutations.
- `ConversationReadState`: one actor-scope boundary tuple
  `(createdAt, Message.id)`. `Message.readAt` is legacy and non-authoritative.
- `NotificationPreference`: Person-owned in-app optional-category policy;
  `ACCOUNT` is not suppressible.
- `NotificationPreferenceSuppression`: broadcast visibility intervals so a
  future preference change does not rewrite history.
- `OutboundPreference`: Person-owned opt-in by Email/SMS/Push and category;
  active-Business switching does not create another profile.

Marking a Conversation read reconciles only direct `message.received`
Notifications for the same Person, Conversation, and Message tuple through the
chosen boundary. It does not change another Person, a later Message, a later
Notification, or an unrelated event. Notification archive state is unchanged.

## Exact-once and optimistic-version contracts

| Contract | Durable identity/ledger | Conflict behavior |
| --- | --- | --- |
| Notification event | globally unique canonical `eventKey` | producer uses conflict-safe creation; one event identity remains one row |
| Notification mutation | Person/idempotency key plus request hash | exact replay returns stored result; changed replay conflicts |
| Message send | unique sender User/idempotency key plus request hash | exact replay returns original Message; changed body/scope conflicts |
| Conversation identity | unique canonical identity key | concurrent start resolves one Conversation |
| Campaign mutation | Admin User/idempotency key plus request hash | exact replay returns transition; changed replay conflicts |
| Campaign version | `expectedVersion` | stale version conflicts before rewrite |
| Outbound preference | Person/idempotency key plus version/hash | exact replay stable; stale/changed replay conflicts |
| Delivery | unique campaign/Person/channel | snapshot replay cannot duplicate |
| Attempt | unique Delivery/attempt number | claim/dispatcher replay cannot duplicate provider-attempt evidence |
| Admin audit | mutation-derived stable idempotency | one mutation produces one sanitized audit row |

Accepted outbound Delivery history is immutable. Preference or identity change
affects future eligibility and just-in-time unclaimed work; it never changes an
accepted historical attempt.

## Cursor and signer inventory

| Cursor | Audit-point envelope | Scope binding | Finding |
| --- | --- | --- | --- |
| Gate 4A Notification | version 1 Base64URL plus public SHA-256 checksum | Person, Customer/Business scope, filter, page size | current tenant checks fail closed, but the client can recompute checksum after changing snapshot/sort/id |
| Gate 4B Conversation/Message | version 1 Base64URL plus public SHA-256 checksum | actor scope, active Business membership/Role, filter, page size, kind, Conversation | current tenant checks fail closed, but the client can recompute checksum after changing snapshot/sort/id |
| Gate 4C Campaign/Delivery/Attempt | strict version 2 HMAC-SHA-256 | current Admin grant, kind, parent, filter, page size, fixed snapshot | authenticated with a dedicated HKDF key and timing-safe comparison |

The Gate 4C signer is `server-only`, derives 32 bytes from the existing
`BETTER_AUTH_SECRET` with HKDF-SHA-256 info
`rezno:communications:cursor-signing:v2`, rejects weak/default secrets, and
never exposes the secret or derived key. Rotation invalidates transient
cursors.

### Pre-remediation P2 finding G4D-01 — public-checksum snapshot forgery

Gate 4A and Gate 4B public checksums are integrity checks only against accidental
corruption. A client can decode the JSON, change the fixed snapshot or sort
anchor, recompute the repository-known SHA-256 checksum, and obtain an accepted
cursor for the same legal actor scope. This does not bypass Person/tenant
authorization, but it violates the locked fixed-snapshot invariant and the
closure requirement to reject snapshot manipulation. Gate 4D must replace
those envelopes with strict authenticated version 2 cursors, use distinct
HKDF domains, reject v1 without downgrade, validate against authoritative
transaction time, and expose only `INVALID_CURSOR`. No schema change is needed.

## Producers and content policy

Canonical Notification producers are Booking creation/lifecycle/change,
Restaurant reservation lifecycle, Review creation/request, Commerce Order and
Store/Product moderation, Message arrival, historical backfill, and Admin
campaign in-app dispatch. They all converge on `createCanonicalNotifications`.

Canonical Message producers are booking open plus explicit first/reply sends
through `delivery-service`; opening a Booking without a body creates no
Message. Canonical Campaign producers are the permissioned Admin actions only.

Message body and Admin campaign content are normalized bounded plain text.
React renders Message content as text. Email HTML is platform-generated by
escaping the Admin plain-text body. Arrival Notification copy never includes
raw Message text. Admin audit metadata never includes localized campaign copy,
contact endpoints, provider payload, credential, or raw provider error. No
arbitrary URL/deep-link or provider-payload override exists.

## Preference and endpoint sources

- in-app preference source: current Person's `NotificationPreference` plus
  suppression interval ledger;
- outbound preference source: current Person's versioned `OutboundPreference`;
- Email source: normalized current Better Auth `User.email` only when
  `emailVerified=true`;
- SMS source: normalized current `Person.phone` only when
  `phoneVerifiedAt` is non-null;
- Push source: no production endpoint model, therefore `MISSING_ENDPOINT`;
- no Booking, Order, audit, Notification metadata, client field, or snapshot is
  accepted as a contact endpoint.

`ACCOUNT` may be mandatory and bypass outbound opt-out, but not active-Person,
endpoint-verification, provider-configuration, content, or audience checks.
`ADMIN_ANNOUNCEMENT` cannot be marked mandatory.

## Admin permissions

- `MESSAGES_VIEW`: own Admin Conversation list/detail/read;
- `MESSAGES_SEND`: own Admin first/reply send and bounded target search;
- `NOTIFICATIONS_VIEW`: campaign list/detail/reporting and Admin navigation;
- `NOTIFICATIONS_SEND`: campaign create/update/schedule/send/cancel/preview;
- `COMMUNICATIONS_DISPATCH`: bounded manual due dispatch and requires send plus
  view through the normalized permission dependency graph.

Expiry, revocation, suspension, environment allowlist change, or permission
removal is re-evaluated inside the authoritative service transaction. Old
cursors are not grants.

## Legacy, duplicate, and dead paths

- `/admin/notifications` is the required legacy redirect to
  `/admin/communications`.
- `createAdminNotification` is disabled and returns a safe error; it is not an
  alternate writer.
- `AdminNotificationForm` and `getAdminNotificationsPageData` are unreachable
  dead source. The latter retains an obsolete fixed 50/200/200 read and should
  be removed in Gate 4D to prevent accidental resurrection.
- `CONVERSATION_CLOSED` remains an unused Message error code although no shared
  close/reopen lifecycle exists. It is harmless dead contract surface and may
  be removed without inventing close/reopen.
- `Message.readAt` remains a migration-preserved compatibility column but is
  not a read-state source.
- the Commerce-only legacy mobile Notification API is a distinct Commerce
  surface; the Stage 4 mobile center uses `/api/mobile/notifications`.

## Process-local limits and intentionally unconnected operations

Message send/start and Admin communications use process-local rate limiting.
It is defense in depth only; Stage 6 owns distributed rate limiting. There is
no timer, Vercel Cron, always-on worker, distributed queue, webhook/receipt
processor, or automatic retry runner. The due-dispatch service and CLI are
manual entry points. Production providers remain `NOT_CONFIGURED`.

## Staging-only and test-only hooks

Staging-only behavior is the deterministic outbound sink, gated by exact
enable/confirmation markers, non-production runtime, and exact staging/test
database name. Fixtures require their own marker, confirmation, deterministic
namespace, and environment/database guards.

Test-only hooks exist for Message authorization/rate limiting, Communication
authorization, snapshot diagnostics, endpoint diagnostics, Push endpoint
resolution, provider factory, and cursor signing secret. Each production module
is `server-only` where secret/contact/provider data is involved, and injection
setters reject `NODE_ENV=production`.

## PII, error, HTML, and secret boundaries

Potential PII ingress points are current identity joins, bounded Admin target
labels, authorized Conversation participant labels, endpoint resolution, and
provider calls. Public DTOs omit email, phone, token, endpoint fingerprint,
address, coordinates, instructions, session, permission arrays, hashes, and
credentials. Delivery reporting includes Person UUIDs as authorized Admin
operational identifiers, but never contacts.

Known raw-error boundaries map Prisma/PostgreSQL/provider failures to stable
domain or generic internal errors. Fixture wrappers print allowlisted safe
messages/codes only. Stored Message/campaign copy is not rendered with raw
HTML. `safeEmailHtml` escapes the body and uses only platform-owned internal
links. Secret-dependent signing is server-only and no secret/key value is
logged, audited, serialized, or embedded into Client/Mobile code.

## Tenant and revocation transition points

Tenant scope changes at active-Business selection, membership replacement,
Role replacement, Booking assignment, Conversation source ownership,
Notification typed-destination authorization, campaign audience snapshot, and
the just-in-time outbound eligibility recheck. Every one of these reads current
database state. Membership/Role/Admin revocation matters before list/detail,
cursor interpretation, mutation, read reconciliation, audience preview,
snapshot, claim, provider preparation, and manual dispatch.

## Web, Mobile, locale, and accessibility audit

Customer Web and Business Web use canonical Notification and Message services.
Only the selected Conversation has the client read marker; a full list render
does not mark all Conversations. Filters and cursor links retain their active
scope. Unauthorized records are structurally omitted, not hidden in the
client. Customer Mobile exposes the same safe DTOs and no Business Mobile
communications scope was added.

Web locale contract is AR primary RTL, EN LTR, and CKB according to the existing
RTL contract. Mobile maps `ar`, `en`, and `ckb` and applies RTL to AR/CKB.
Messages use the `Messaging` translation namespace and Notification headings
use `Notifications`; Message bodies remain authored text.

### Pre-remediation P2 finding G4D-02 — stale operational truth and broken locale copy

The production Business Communications landing page still says Messaging and
outbound delivery are deferred to 4B/4C even though both gates are merged. Gate
4C Admin, outbound-preference, and manual-dispatch components also contain
fixed English/mixed copy, and Notification mutation notices fall back to
English in AR/CKB. This is a closure truth/localization defect, not a visual
redesign. Gate 4D must update the landing page, localize reachable Stage 4
operational copy in AR/EN/CKB, retain truthful provider/scheduler wording, and
add focused key-completeness/accessibility assertions.

Existing buttons generally have visible accessible names, filters use nav or
button semantics, forms expose pending/disabled state, and status messages use
`role=status`/`aria-live` where present. Campaign form Label associations and
selected-state semantics require focused closure correction; visual polish is
not part of this gate.

## API and Server Action strictness

Mobile Notification and Message Route Handlers reject duplicate/unknown query
or body fields, parse UUIDs strictly, bound page/content sizes, require UUID
idempotency on mutations, authenticate inside the handler, and use no-store
safe responses. Mobile mutations enforce the existing Origin/trusted-client
contract. Server Actions authenticate and reauthorize inside canonical
services; form visibility is not authority. Admin campaign actions accept only
strict domain schemas and stable error codes. Raw Prisma constraints, SQL,
stack traces, and provider errors do not cross these boundaries.

## Database and performance audit

The repository has exactly 38 forward migrations. PR #119 added only
`20260718170000_admin_outbound_communications` over the PR #118 merge base;
migrations 1–37 are unchanged. No closure finding requires a schema or new
domain model, so migration 39 is not required.

Bounded production work:

- Notification list 1–50; unread count bounded at 100,000; batched state and
  typed-destination authorization;
- Conversation and Message page 1–50; no per-row Conversation hydration loop;
- campaign/Delivery/Attempt page 1–50;
- Admin target search at most 20;
- audience preview/snapshot at most 5,000 People, endpoint bulk chunks 1,000,
  delivery inserts chunks 1,000;
- due claim at most 50;
- no provider call inside the audience-snapshot transaction;
- existing query-plan evidence covers the Notification, Conversation, Message,
  Campaign, Delivery, Attempt, preference, audience, endpoint, and target
  access paths.

Gate 4D will repeat two fresh `1→38` deployments, populated `37→38`, query-plan
diagnostics, and real-staging `38/38` evidence. Timings are diagnostic evidence,
not universal latency guarantees.

## Mandatory finding register

1. Production writes: inventoried above; three canonical domains, no alternate
   reachable writer.
2. Production reads: inventoried above; all list/history/reporting work is
   bounded.
3. Actors/policies: Customer, four Business roles, Admin permission variants,
   environment Super Admin, and revoked/foreign cases are explicit.
4. Idempotency ledgers: NotificationInteraction, Message sender/key, Campaign
   mutation, OutboundPreference mutation, plus deterministic event/delivery/
   attempt/audit uniqueness.
5. Optimistic versions: Notification state/inbox/preference, Conversation read
   state, Campaign, and OutboundPreference.
6. Cursors/signers: three implementations; G4D-01 affects 4A/4B only.
7. Notification producers: Booking, Restaurant, Review, Commerce/moderation,
   Message, backfill, Admin campaign.
8. Message producers: canonical first/reply operations only.
9. Campaign producers: permissioned Admin campaign actions only.
10. Read-state owners: Person/scope for Notifications and Conversation
    participants; legacy Message.readAt is not authoritative.
11. Unread sources: canonical Notification effective-state query and canonical
    Message boundary aggregate.
12. Preference sources: Person-owned in-app and Person-owned outbound profiles.
13. Endpoint sources: verified current User email, verified current Person
    phone, no production Push endpoint.
14. Admin permissions: separated view/send/dispatch and message view/send.
15. Legacy wrappers: Admin Notification redirect plus disabled action.
16. Dead/duplicate paths: old Admin form/list service and unused closed error;
    no duplicate writer.
17. Process-local limits: Message start/send and Admin communications.
18. Staging-only hooks: guarded deterministic sink and exact fixture runners.
19. Test-only hooks: authorization, limiter, diagnostics, endpoint, provider,
    and signer injection with production rejection.
20. Secret modules: server-only Gate 4C cursor signer at audit point.
21. PII ingress: identity/target/endpoint/provider boundaries; DTO/log/audit
    exclusions recorded above.
22. Raw HTML: none from Message/campaign; email HTML is generated and escaped.
23. Tenant transitions: active Business, membership/Role, assignment,
    destination, audience, and dispatch recheck.
24. Revocation points: every read/write/claim boundary reauthorizes current
    state.
25. Intentionally unconnected: real providers, scheduler, worker, receipts,
    device tokens, physical delivery.
26. Migration 39: not required.
27. P1/P2: no P0/P1; two P2 closure defects G4D-01 and G4D-02 require
    remediation before Ready.
28. Stage 5 ownership: attachments, managed upload, media/storage processing,
    and payment foundation.
29. Stage 6 ownership: automatic durable scheduler/worker, distributed queue,
    distributed rate limiting, receipts/webhooks, production operations.
30. Stage 7 ownership: device-token lifecycle, APNs/FCM, signed releases,
    TestFlight, physical-device and real receipt QA.
31. Stage 8 ownership: broad visual/brand redesign, final motion and polish.

## Deferred-work register

### Stage 5

Managed attachments, uploads, image/document storage, media processing, and
payment foundation. None is implemented by Gate 4D.

### Stage 6

Automatic production scheduling, Vercel Cron, always-on worker, distributed
queue/rate limiting, provider webhooks/receipts, and expanded operations
dashboards. Gate 4D keeps manual bounded dispatch only.

### Stage 7

Device-token lifecycle, APNs/FCM adapters and credentials, TestFlight/signed
release builds, physical iPhone/Android QA, and real Email/SMS/Push receipt
claims. Static Expo/Android/iOS exports are not physical-device evidence.

### Stage 8

Broad visual redesign, branding redesign, final animation, and visual polish.
Gate 4D changes only functional truth, localization, and accessibility defects.

### Non-blocking operational debt

- process-local Message/Admin rate limiting until Stage 6;
- bounded unindexed contains-search where accepted query plans show small
  current cardinality;
- Moderate dependency advisories that require incompatible major framework
  upgrades and have no demonstrated Stage 4 exploit path.

AI remains blocked until Stage 8 is complete. Gate 4D does not begin Stage 5 or
any later-stage work.

## Evidence ledger (to be completed on the immutable PR head)

The final section will record local totals, migration rehearsals, performance
plans, security review, deterministic integrated fixture fingerprints, exact
staging deployment/role/cross-gate matrix, cleanup, exact-head GitHub Actions
and Vercel, review-thread count, commits, and final Gate 4D verdict. Recording
successful local evidence here will not announce Stage 4 completion before the
PR is independently reviewed and merged.
