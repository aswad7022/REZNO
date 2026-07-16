# Stage 2 Business Operations Closure

Status: implementation and exact-head staging validation in progress. This document must not be read as a declaration that Stage 2 is complete until the PR review and merge gates have passed.

## Pre-implementation closure audit

The audit below was recorded against `origin/main` at `34923e8343c5f2e8166acff5f6d40250648d690b`, before Gate 2D implementation. Documentation and earlier completion reports were treated as hints; the classifications come from the concrete App Router pages, server services, Business Operations policy, Prisma schema, tests, and navigation code.

| Route or surface | Baseline classification | Baseline authorization and scope | Finding before Gate 2D |
| --- | --- | --- | --- |
| `/business` | Production-connected, read-only | Any active Business membership; Staff only gets a partial query filter | P1: one broad DTO, server-timezone “today”, misleading review/notification metrics, and management controls rendered to restricted roles |
| `/business/calendar` | Production-connected, read-only plus mutations through separately authorized actions | Owner/Manager management scope; Receptionist active-Branch operational scope; Staff self scope | Canonical Stage 2C service exists; dashboard/navigation must reuse its scope rules |
| `/business/bookings` | Production-connected, read-only plus mutations | `BOOKING_READ`; mutation capabilities checked again in services | Role scope is enforced in the canonical daily-operations service |
| `/business/bookings/[bookingId]` | Production-connected, read-only plus mutations | `BOOKING_READ`; tenant and role scope checked server-side | No dashboard shortcut may broaden detail access |
| `/business/bookings/[bookingId]/reschedule` | Production-connected, mutation-capable | `BOOKING_CHANGE_PROPOSE`, tenant scope, version/idempotency checks | Keep as an operational route; do not expose to Staff |
| `/business/reservations` | Production-connected, Restaurant-only, read-only plus mutations | Restaurant vertical plus `BOOKING_READ`/Restaurant operation capabilities | Must be absent for generic businesses and Staff |
| `/business/reservations/[bookingId]` | Production-connected, Restaurant-only, read-only plus mutations | Restaurant vertical and canonical business-operation reference | Must preserve Receptionist active-Branch scope and fail closed for Staff |
| `/business/services` | Production-connected, role-scoped read; management mutations | Management catalog for Owner/Manager, active read catalog for Receptionist, assigned-service catalog for Staff | Link is valid only where the role-scoped catalog is deliberately exposed; quick actions must not imply write access |
| `/business/team` | Production-connected, role-scoped read; management mutations | Owner/Manager management, Receptionist active workforce read, Staff self-only | Baseline sidebar exposes a broad “team” label to Staff even though payload is self-only |
| `/business/team/[memberId]/availability` | Production-connected, role-scoped read/write | Owner/Manager all permitted members; Staff only self; Receptionist read-only | Direct service checks are canonical; navigation must link Staff only to their own membership |
| `/business/manage` | Production-connected profile form, mutation-capable for management | Baseline page gate was only `BRANCH_READ`, so Receptionist/Staff could render Organization profile data | P1: incorrectly exposed and not a management landing hub |
| `/business/manage/settings` | Production-connected, mutation-capable | `SETTINGS_READ`/`SETTINGS_WRITE`, Owner/Manager only | Correct direct-route boundary |
| `/business/manage/locations` | Production-connected, mutation-capable for management | `BRANCH_READ`; write/archive capabilities control forms/actions | Receptionist/Staff read access is broader than the final management-hub contract; no management navigation should point here for them |
| Branch hours routes | Production-connected, mutation-capable for management | `HOURS_READ`/`HOURS_WRITE`, tenant-bound Branch ID | Direct authorization exists; management repair links must be capability-aware |
| Branch block routes | Production-connected, mutation-capable | `BLOCK_READ`/`BLOCK_WRITE`, tenant-bound Branch ID | Receptionist operational use is deliberate; Staff uses separate self-block rules |
| `/business/manage/audit` | Production-connected, read-only | `AUDIT_READ`, Owner only | Correct direct-route boundary; must be absent for Manager/Receptionist/Staff |
| `/business/public-profile` | Production-connected, mutation-capable | Baseline page gate was `BRANCH_READ`; write form later checked management role | P1: read payload and management URLs were exposed to Receptionist/Staff; page must require management authority before reads |
| `/business/tables` | Production-connected, Restaurant-only, role-scoped read/write | Restaurant vertical; table read/write capabilities | Receptionist read is deliberate; Staff must not receive Restaurant operations |
| `/business/menu` | Production-connected, Restaurant-only, role-scoped read/write | Restaurant vertical; menu read/write capabilities | Receptionist read is deliberate; Staff must not receive Restaurant operations |
| `/business/analytics` | Placeholder/deferred in catch-all | Any active Business membership could render placeholder | P1: described “revenue” without a real analytics contract or management authorization |
| `/business/reviews` | Production-connected, read-only plus Owner/Manager replies | Baseline list read was Organization-wide for every Business role; replies were Owner/Manager only | The Gate 2D overview must count only visible reviews without a business reply and must not expose review content to Staff |
| `/business/messages` | Production-connected but later-stage closure deferred | Existing Identity messaging policy allows Owner/Manager only | Keep existing boundary; do not redesign Messaging in Gate 2D |
| `/business/notifications` | Production-connected read surface but later-stage closure deferred | Existing audience, business ID, and recipient policy | Schema has no read state; “unread” cannot be claimed |
| `/select-business` | Production-connected, mutation-capable active-context selector | Membership-derived accessible businesses; safe return path | Active business must be re-derived on every request; no cross-request identity cache |
| Business layout/header/sidebar/breadcrumbs | Production-connected shell | Layout requires active Business identity | P1: sidebar/mobile/command palette use mostly vertical and static links, not SystemRole/capabilities |
| Business command palette | Production-connected client navigation | Baseline command list was static for every Business role | P1: forbidden management hrefs were serialized for Receptionist/Staff |
| Business catch-all | Placeholder registry | Only active Business identity from layout; no per-feature capability | Contains stale definitions for concrete routes and presents Analytics as a broad placeholder |

### Data and query audit

- The dashboard used the Node process timezone for “today”. This is wrong for both a single Branch outside the server timezone and Organizations with Branches in multiple timezones.
- Receptionist dashboard scope was Organization-wide. The closure contract requires active-Branch scope and exclusion of inactive/deleted Branches.
- Staff dashboard scope filtered by `memberId`, but the returned TypeScript contract still included Organization fields, setup controls, public slug, and management action shapes.
- “Pending reviews” counted completed Bookings with no Review. The truthful business metric is visible Reviews without a business reply.
- “Unread notifications” counted `BookingStatusHistory`. `Notification` has no read-state column, so Gate 2D uses a truthful bounded “operational updates today” definition instead of inventing unread state.
- Setup readiness required only one open hours row on any Branch. It did not require a complete seven-day hours definition per active Branch.
- REQUIRED Service readiness accepted any active non-owner member. It did not prove active Person, active membership, active Branch assignment, explicit Service assignment, available BranchService, and a valid active schedule on the same Branch.
- Restaurant readiness counted active tables, categories, and items independently, without proving active Branch/public relationships.
- Recent dashboard reads are bounded, but the old DTO and Restaurant overview duplicated dashboard queries and timezone mistakes.
- Existing Stage 2 mutation services consistently re-resolve membership, tenant, capability, target ownership, idempotency, and optimistic version. Gate 2D must build on those services instead of creating a second authorization system.
- Dashboard and analytics payloads must omit customer email, phone, notes, cancellation reasons, auth IDs, and employee contact data. Staff payloads must also omit other membership IDs and all Organization totals.

### Baseline defects selected for Gate 2D

1. Replace the broad Business dashboard DTO with structurally distinct management, receptionist, and staff-self contracts.
2. Use Branch-local bounded day ranges for operational metrics and a stable per-request snapshot.
3. Correct Notification, Review, readiness, and quick-action semantics.
4. Add real management-only operational analytics with bounded, tenant-scoped queries and no revenue claims.
5. Make navigation, mobile navigation, and command palette capability-aware while retaining direct server authorization.
6. Replace `/business/manage` with a management hub and harden `/business/public-profile` to Owner/Manager.
7. Reduce the Business placeholder registry to explicitly deferred later-stage routes.

## Gates 2A–2D architecture

- **2A — Operational Core:** centralized Business capability policy, active-Business actor resolution, Branch/settings/hours/blocks lifecycle, optimistic versions, idempotency, mutation rate gates, and sanitized audit events.
- **2B — Services and Workforce:** Organization-owned Services, Branch offerings, invitations/memberships, Branch and Service assignments, schedules, professional profiles, and role-scoped catalogs.
- **2C — Daily Operations:** role-scoped calendar, Booking/customer-change operations, Restaurant table/menu/reservation operations, branch-local scheduling, safe activity history, and concurrency controls.
- **2D — Closure:** structurally role-scoped overview DTOs, truthful metrics, bounded analytics, canonical readiness, capability-aware navigation/actions, management hub, route matrix, and security/regression closure.

Gate 2D adds no schema migration and does not duplicate the Identity or Business Operations policy systems.

## Final role and capability contract

| Surface | Owner | Manager | Receptionist | Staff |
| --- | --- | --- | --- | --- |
| Overview | Organization management DTO | Organization management DTO | Active-Branch operational DTO | Self-only DTO |
| Analytics | Read | Read | Denied | Denied |
| Readiness | Full checks and repair links | Full checks and repair links | Not serialized | Not serialized |
| Management hub | Full, including audit | Full, excluding audit/archive ownership | Denied | Denied |
| Calendar/Booking operations | Organization scope | Organization scope | Active permitted Branches | Own assigned Bookings only |
| Services/workforce | Read/write | Read/write within Manager policy | Deliberate active operational reads only | Assigned Services and own membership/schedule only |
| Restaurant tables/menu/reservations | Read/write | Read/write | Operational read/operate policy | Denied; own calendar/availability remains self-scoped |
| Public-profile management | Read/write | Read/write | Denied | Denied |
| Audit | Read | Denied | Denied | Denied |
| Messages | Existing Identity organization-messaging policy | Existing Identity organization-messaging policy | Denied | Denied |
| Notifications | Actual audience/recipient policy | Actual audience/recipient policy | Actual audience/recipient policy | `ALL` and personal `USER` only |

The four closure capabilities are `BUSINESS_OVERVIEW_READ`, `BUSINESS_ANALYTICS_READ`, `BUSINESS_READINESS_READ`, and `BUSINESS_MANAGEMENT_HUB_READ`. They extend the existing policy and actor resolver; they do not form a new role system.

## Canonical Stage 2 route matrix

`R` means a bounded read, `W` means a separately capability-checked mutation, `AB` means active permitted Branch scope, and `SELF` means the authenticated membership only. `404/F` is the safe not-found/forbidden result; hiding navigation is never the authorization boundary.

| Route | Owner | Manager | Receptionist | Staff | Vertical / scope / safe denial |
| --- | --- | --- | --- | --- | --- |
| `/business` | R Organization | R Organization | R AB | R SELF | Any; structurally distinct DTO |
| `/business/calendar` | R Organization | R Organization | R AB | R SELF | Any; bounded pagination |
| `/business/bookings` | R/W | R/W | R/W AB | R SELF | Generic only; Restaurant 404 |
| `/business/bookings/[bookingId]` | R/W | R/W | R/W AB | R SELF | Generic only; tenant/role target lookup |
| `/business/bookings/[bookingId]/reschedule` | W | W | W AB | 404/F | Generic only; idempotency/version checks |
| `/business/reservations` | R/W | R/W | R/W AB | 404/F | Restaurant only |
| `/business/reservations/[bookingId]` | R/W | R/W | R/W AB | 404/F | Restaurant only; safe activity DTO |
| `/business/services` | R/W | R/W | R AB | R assigned | Generic only; no Receptionist navigation shortcut |
| `/business/team` | R/W | R/W | R AB | R SELF | Any vertical |
| `/business/team/[memberId]/availability` | R/W permitted target | R/W permitted target | R AB | R/W SELF | Any vertical; foreign member 404/F |
| `/business/manage` | R | R | 404/F | 404/F | Any; management capability |
| `/business/manage/settings` | R/W | R/W | 404/F | 404/F | Any; settings capability |
| `/business/manage/locations` | R/W | R/W | R active only | 404/F | Any; Receptionist receives no inactive Branch and no navigation link |
| Branch hours route | R/W | R/W | R AB | 404/F | Any; Branch tenant lookup |
| Branch block route | R/W | R/W | R/W AB | 404/F | Any; self-blocks use the separate member route/policy |
| `/business/manage/audit` | R | 404/F | 404/F | 404/F | Owner only; bounded sanitized audit |
| `/business/public-profile` | R/W | R/W | 404/F | 404/F | Any; management check precedes reads |
| `/business/tables` | R/W | R/W | R AB | 404/F | Restaurant only |
| `/business/menu` | R/W | R/W | R AB | 404/F | Restaurant only |
| `/business/analytics` | R | R | 404/F | 404/F | Any; `period=7|30`, invalid input 404 |
| `/business/reviews` | R/W reply | R/W reply | 404/F | 404/F | Generic only; Restaurant review lifecycle excluded |
| `/business/messages` | Existing policy | Existing policy | 404/F | 404/F | Stage 4 owns functional closure |
| `/business/notifications` | Audience policy | Audience policy | Audience policy | Personal/ALL policy | Stage 4 owns read-state/redesign |
| `/business/profile` | SELF | SELF | SELF | SELF | Personal profile only |
| `/select-business` | Accessible memberships | Accessible memberships | Accessible memberships | Accessible memberships | Selection derived server-side; safe return path |
| Business catch-all | 404 | 404 | 404 | 404 | Unknown/stale placeholders are not product functionality |

The executable registry is `STAGE2_ROUTE_POLICIES`. Dynamic route segments are matched as parameters, and unit/HTTP tests exercise representative concrete URLs.

## Overview DTO contracts

The server returns a discriminated union rather than one broad shape with JSX hiding:

- `MANAGEMENT`: Organization name/vertical, truthful Organization operational metrics, readiness, bounded safe upcoming bookings, and management quick actions. Owner and Manager have distinct role values so audit actions remain Owner-only.
- `RECEPTIONIST`: active permitted Branch metrics, Restaurant-today count where applicable, bounded safe upcoming bookings, and operational actions. Organization readiness, setup fields, public slug, team/Service totals, and management links are absent from the type and payload.
- `STAFF_SELF`: own today/upcoming/completed/no-show counts, up to five own next appointments, and self calendar/actions. It structurally omits Organization totals, readiness, other membership IDs, customer contact data, audit, analytics, and management actions.

All returned appointment records contain only Booking ID, service snapshot name, Branch display name/timezone, start time, status, and service/Restaurant discriminator. They never contain customer email/phone/name, notes, cancellation reasons, auth IDs, price, or audit history.

## Dashboard metric definitions

| Metric | Exact definition |
| --- | --- |
| Today active | `PENDING + CONFIRMED` Bookings whose `startsAt` falls in the owning Branch's local calendar day, scoped by role |
| Upcoming active | `PENDING + CONFIRMED`, `startsAt >= snapshotAt`, role-scoped |
| Pending confirmations | Upcoming `PENDING` Bookings created no later than the stable snapshot |
| Completed/no-show/cancelled today | Same Branch-local day ranges and role scope, grouped by persisted status |
| Pending customer changes | `PENDING` change requests where requester equals Booking customer, same tenant/permitted Branch, created no later than snapshot |
| Reviews awaiting reply | Generic-service Review is `VISIBLE`, same tenant, and `businessReply IS NULL`; Restaurant reservations are excluded |
| Operational updates last 24 hours | Actual `Notification` rows matching the existing Business audience/recipient policy in `[snapshot-24h, snapshot]` |
| Active Branches | Non-deleted `ACTIVE` Branches visible to the DTO scope |
| Active Services | Non-deleted `ACTIVE` Organization Services; Restaurant DTO uses menu/table counts instead |
| Active workforce | Active non-owner memberships whose Person is active and not deleted |
| Active Restaurant tables | Active tables attached to a non-deleted active same-tenant Branch |
| Active menu items | Available items in active same-tenant menu categories |

There is no Business notification read-state in the 30-migration schema. Gate 2D therefore does **not** claim unread notifications. Booking status history remains part of the notification page aggregation, but it is not the dashboard Notification metric.

## Timezone and multi-Branch policy

One request captures one `snapshotAt`. For every active/permitted Branch, its IANA timezone produces an independent half-open UTC range `[local midnight, next local midnight)`. Prisma uses a bounded `OR` of `(branchId, startsAt range)` pairs; it never uses the server process timezone or the first Branch's timezone for other Branches. Completed analytics periods use `[local midnight N days ago, local midnight today)` independently per Branch, including DST transitions. The test fixture covers Asia/Baghdad and Europe/Istanbul boundary behavior.

## Basic operational analytics

Periods are exactly the last 7 or 30 **completed Branch-local calendar days** at a stable snapshot. Definitions are deliberately operational:

- total Bookings and persisted status distribution;
- generic Booking count versus Restaurant reservation count;
- completion, cancellation, and no-show percentages as `status count / total`, rounded to two decimals and zero when the denominator is zero;
- top 10 Service snapshot names, Branch snapshots, and assigned staff workloads, ordered count descending then name/ID ascending;
- Restaurant guest totals from persisted reservation details;
- one zero-filled daily series for the selected completed period.

The service uses database `groupBy`, bounded relation lookups, and one parameterized timezone aggregation. It derives tenant only from the current actor, applies `createdAt <= snapshotAt`, never interpolates raw SQL values, never loads all Bookings, and does not cache identity or current time. It returns no customer PII, notes, reasons, contacts, price, revenue, profit, tax, refunds, or Commerce Orders. Historical Branch/member/Service snapshot labels remain countable even after operational relationships become inactive.

## Canonical readiness

Readiness is management-only and is evaluated from current persisted state:

1. Organization is active, not deleted, and has minimum profile name/category/description/phone plus logo and cover image.
2. At least one active non-deleted Branch exists, and **every** active Branch has exactly seven unique valid hours rows. Closed days are valid; open days require a valid increasing time range.
3. Booking is enabled and marketplace visibility is enabled.
4. Generic businesses have an active Service and at least one available offering on an active same-tenant Branch.
5. Every active `REQUIRED` Service offering is workforce-ready only when one same-tenant active/non-deleted Person and membership has an explicit Service assignment, active assignment to that same Branch, and active availability on that same Branch.
6. Restaurants instead require an active table on an active Branch, an active menu category, and an available item in an active category.

Archived/deleted/inactive relationships cannot satisfy current readiness. Readiness is not sent to Receptionist or Staff. The score is the percentage of required checks, with `ready` only at 100%; missing-check repair links are rendered only to Owner/Manager.

## Navigation, command center, and management hub

Server layout supplies SystemRole, Business vertical, membership ID, existing messaging authorization, and public slug only when `SETTINGS_READ` is allowed. Sidebar, mobile navigation, and command palette are generated from that input, so forbidden URLs are absent from HTML/RSC rather than merely disabled.

- Owner receives management, public profile, analytics, audit, calendar, relevant Service/Restaurant operations, and workforce.
- Manager receives the same operational management areas except audit/Owner-only archive ownership.
- Receptionist receives calendar and the relevant Booking/Restaurant operational links; Restaurant table/menu reads remain deliberate. No management, analytics, review, public-profile, or messaging links are serialized.
- Staff receives overview, own calendar, own availability, and assigned Service read for generic businesses. Restaurant operations and all Organization management links are absent.

`/business/manage` is a capability-gated landing hub. It contains links only; it does not duplicate mutation forms. Restaurant management includes tables, menu, and workforce. Readiness is summarized, and audit is Owner-only.

## Active-Business, tenant, and concurrency foundations

Every closure service resolves the actor again from Person, active membership, active role, and active Organization using the selected Business context. Client-provided Organization IDs are not accepted by overview/readiness/analytics. Switching the active Business changes the resolved tenant for every query. Revoked membership, deleted Person, stale Business selection, foreign target IDs, and wrong vertical fail before records are returned.

Stage 2 mutations retain the Gate 2A–2C controls: strict input schemas/allowlists, rendered-tenant binding, per-actor mutation throttles, database locks, optimistic versions, idempotency keys/request hashes, deterministic replay, and sanitized audit snapshots. Gate 2D is read-heavy and adds no alternative mutation path.

## Public-profile and image URL security review

Public-profile read and update services now require `SETTINGS_READ` before reading Organization/profile/Service data. Receptionist and Staff cannot render the management form. Existing actions retain strict field allowlists, tenant derivation, validation, and audit behavior; there is no mass assignment of Organization IDs.

Business-managed image fields (profile logo/cover/OG/gallery, Services, workforce photo, and Restaurant menu item) now accept only bounded HTTPS URLs with no credentials, no literal IP host, no localhost, and no common private hostname suffix. Next Image's global HTTP wildcard was removed; only HTTPS remote sources remain, in addition to its resolved-address safety. Uploads, malware scanning, object storage, transformation, and a curated media-host allowlist remain Stage 5 work.

## Performance and error review

- Overview result sets are bounded to five next appointments with deterministic `startsAt ASC, id ASC` ordering.
- Analytics periods are fixed at 7/30 days and top dimensions are capped at 10.
- Queries aggregate in PostgreSQL; there is no per-Booking customer/User lookup and no full Booking table materialization.
- Existing tenant/date/status and relationship indexes from migrations 1–30 support the paths; no proven plan deficiency justified migration 31.
- Rates are zero-safe; analytics renders a truthful empty state.
- Invalid analytics period, wrong vertical, missing/foreign record, and stale context fail as safe not-found/forbidden/validated domain errors. No production mock fallback or raw Prisma/PostgreSQL message is rendered.
- No shared response cache contains actor identity or unstable current time.

## Placeholder and deferred registry

Concrete Business routes are no longer registered in the Business catch-all. Unknown Business paths fail 404. The code registry assigns deferred ownership as follows:

| Stage | Deferred ownership |
| --- | --- |
| 3 | Commerce merchant/admin, fulfillment, inventory, Order operations |
| 4 | Notification center/read state/delivery and Messaging closure |
| 5 | Media upload/storage/scanning/transformation |
| 6 | Payments, refunds, settlement, financial reporting |
| 7 | Admin/platform operations |
| 8 | Release QA, final visual polish, physical-device certification, AI |

Advanced BI, revenue recognition, CSV/PDF export, background analytics, email/SMS/push delivery, and Redis jobs are also outside Gate 2D.

## Schema, fixture, and validation evidence

- Repository schema: 30 migration directories; migrations 1–30 unchanged; migration 31 not required.
- Real `rezno-staging` baseline before implementation: 30/30 and up to date, checked without printing credentials.
- Fresh disposable PostgreSQL: all 30 migrations applied successfully.
- Deterministic fixture namespace: `rezno-qa-business-operations-stage2d-closure`.
- Local fixture safety rehearsal: exact staging marker/token required; exact database name asserted inside the transaction; production-like targets rejected; one bounded transaction; no unrelated deletion.
- Local fixture runs 1 and 2 produced the identical sanitized fingerprint `rezno-qa-business-operations-stage2d-closure:4:11:2:2`.
- Final local regression evidence on the implementation tree: 183/183 unit tests, 142/142 PostgreSQL integration tests, and 35/35 production HTTP/RSC/Server Action tests. The focused Gate 2D command additionally passed 11/11 domain/fixture tests and 3/3 PostgreSQL scenario groups.
- Lint, non-incremental TypeScript, Prisma format/validate/generate, the 51-page Next production build, mobile TypeScript, Expo dependency validation, Expo Doctor (20/20), and Android/iOS static exports passed. The generated native/export output was kept outside the repository.
- The existing Prisma 7.8 `@prisma/adapter-pg` nested-write path emits the documented `pg` 8 deprecation warning about concurrent `client.query()` calls in some concurrency regressions. REZNO code does not call `pg` clients directly, all invariants pass, and this is not a Gate 2D correctness or data-isolation failure; it must be rechecked before adopting `pg` 9.
- Exact PR-head preview, real-staging fixture runs, dedicated-role HTTP/RSC smokes, CI/Vercel, and cleanup are evidence gates that must be filled before the PR is marked Ready.

## Known limitations and completion conditions

- The Notification schema has no Business read state; Stage 4 owns that model and delivery redesign.
- Analytics is operational, not financial, and intentionally has no export.
- Business images remain externally hosted HTTPS URLs until Stage 5 supplies managed media.
- No physical-device QA is claimed by this Web closure.
- PR review and merge are external completion gates. This document does not declare Stage 2 merged or released.

Stage 2 may be declared implementation-complete for review only when the complete local validation matrix is green, the exact PR-head Vercel deployment is Ready, the real staging fixture runs twice identically, Owner/Manager/Receptionist/Staff/foreign-tenant smokes pass, temporary identities/sessions/probes are cleaned, exact-head GitHub Actions and Vercel pass, no P1/P2 remains, PR #100 is still untouched, and this PR is marked Ready without merging it.
