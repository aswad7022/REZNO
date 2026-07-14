# Gate 1A identity and permission baseline

Gate 1A establishes the authorization boundary used by later functional
modules. It does not add a new identity provider or replace Better Auth.

## Identity entities and authority

- Better Auth `User` and its current server session authenticate a caller.
  Request bodies and device-local values never select the acting user.
- `Person` is the application identity linked by `authUserId`. Active routes
  require `status = ACTIVE` and `deletedAt IS NULL`.
- `OrganizationMember` connects one Person to one Organization and Role. An
  authorized membership requires `status = ACTIVE`, `deletedAt IS NULL`, an
  active/non-deleted Person, an active/non-deleted Organization, and a Role
  whose `organizationId` matches the membership tenant.
- `Role.systemRole` supplies the fixed organization capability baseline.
  `Role.commercePermissions` supplies explicit Commerce capabilities. Gate 1A
  has no per-membership permission override.
- `AdminAccess` is a platform boundary, not an organization role. It is valid
  only while active and either non-expiring or before `expiresAt`.

## Mobile startup and onboarding

The mobile application resolves exactly one startup state:

| State | Authority and behavior |
| --- | --- |
| `BOOTSTRAPPING` | Session and preferences are still loading; no guest or account screen is rendered. |
| `GUEST_WELCOME_NOT_COMPLETED` | No session and the local informational welcome has not been completed. |
| `GUEST_WELCOME_COMPLETED` | No session; enter the guest application without replaying the welcome. |
| `AUTHENTICATED_PROFILE_INCOMPLETE` | A server session exists, but the active Person does not have both a completed profile flag and a valid phone; show only functional completion. |
| `AUTHENTICATED_PROFILE_COMPLETE` | A server session and complete server profile exist; enter the application directly. |
| `AUTH_ERROR_RETRYABLE` | Session or profile restoration failed; retain no inferred identity and offer retry. |

Only the non-sensitive informational-welcome preference is stored in
AsyncStorage under a versioned key. Better Auth session transport remains in
the existing secure cookie storage. The server status endpoint reads active
Person state without mutating it. Local welcome completion cannot override
server profile completeness. Sign-out preserves the welcome preference, and
every account switch repeats the session and profile-status lookup.

## Organization role matrix

| Capability | Owner | Manager | Receptionist | Staff |
| --- | ---: | ---: | ---: | ---: |
| Organization management | Yes | Yes | No | No |
| Booking operations | Yes | Yes | Yes | No |
| Organization-wide conversations | Yes | Yes | No | No |
| Default Commerce permissions | All approved Owner defaults | None | None | None |

Owner is the default role created by business onboarding. Owner assignment,
ownership transfer, role escalation, and Store lifecycle management require
ownership. Managers cannot create another Owner through the ordinary team
role input. Staff and Receptionist messaging stays fail-closed because a
branch-level staff messaging policy is not yet approved.

Existing booking and business operations continue to use role-derived
capabilities. Actions whose service requires a branch or professional
assignment must still validate that assignment after the tenant and role
checks; the role matrix does not synthesize branch access.

## Commerce permissions

New Owner roles receive this explicit set transactionally:

- `STORE_VIEW`, `STORE_MANAGE`
- `PRODUCT_VIEW`, `PRODUCT_CREATE`, `PRODUCT_UPDATE`, `PRODUCT_ARCHIVE`
- `INVENTORY_VIEW`, `INVENTORY_ADJUST`
- `ORDER_VIEW`, `ORDER_MANAGE`, `ORDER_CANCEL`
- `REPORTS_VIEW`

`STORE_MANAGE` is ownership-only in Gate 1A. Other Commerce permissions may be
assigned explicitly to a non-owner Role by a future authorized management
flow, but an absent permission always fails closed. Organization owners never
receive platform-admin permissions. Business onboarding creates no Store and
therefore cannot publish or expose Commerce automatically.

Business onboarding derives `personId` only from the authenticated server
session. It creates Organization, Branch, profile, settings, Owner Role,
membership, and Person onboarding state in one serializable transaction. A
retry by the same active Owner and slug returns the existing Organization; a
different Person receives a slug conflict.

## Existing-owner backfill

`npm run identity:backfill-owner-commerce` is dry-run by default and prints the
exact Role and Organization records that qualify. A Role qualifies only when:

- it is a system `OWNER` Role with an empty Commerce permission array;
- its Organization is active, enabled, and not deleted;
- it has at least one active, non-deleted member in the same Organization;
- that member's Person is active and not deleted.

Apply requires both `--apply` and the exact reviewed comma-separated Role ids
in `--confirm-role-ids=...`. The service rechecks that the candidate set is
unchanged, repeats the same-tenant eligibility check inside a serializable
transaction, and aborts on drift. A second run finds zero candidates. It never
updates Manager, Receptionist, Staff, inactive/deleted membership, inactive
Person, inactive/deleted Organization, or non-empty Role records.

## Admin and conversation boundary

Environment-listed super admins remain an explicit break-glass source with
all platform permissions. Otherwise, DB `AdminAccess` must be active,
unexpired, and contain the requested permission; `SUPER_ADMIN` DB roles have
the complete known permission set. Suspended, revoked, expired, missing, or
unknown access fails closed.

Conversation authorization always combines type and participant scope:

- customer: own `CUSTOMER_BUSINESS` or `ADMIN_USER` conversation;
- business Owner/Manager: own Organization's `CUSTOMER_BUSINESS` or
  `ADMIN_BUSINESS` conversation;
- admin: `ADMIN_USER` or `ADMIN_BUSINESS` conversation whose `adminUserId` is
  the current authorized admin.

Admin listing, preview, unread count, send, and mark-read use the same scope.
Mark-read authenticates the selected context first, loads the conversation,
checks participant/tenant/type, then updates only unread messages from another
sender. Organization membership never implies admin access, and an admin grant
does not grant another admin's conversation.

## Deliberately deferred

Gate 1A deliberately defers email verification, password reset, account
recovery, OTP phone verification, MFA, transactional email, SMS, mobile
business UI, and fine-grained branch-level staff messaging policy. Those items
require separate product/provider decisions and are not implied by this
baseline.
