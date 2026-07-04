# Unified Account + Professional Identity Architecture

This document records the approved architecture direction for unified accounts,
multi-business ownership, employee consent, professional profiles, booking,
reviews, and future professional discovery in REZNO.

## 1. Unified account

- `User` remains the authentication account managed by Better Auth.
- `Person` remains the private human identity/profile for the authenticated user.
- REZNO must not introduce a permanent customer/business account type.
- Customer, owner, manager, staff, and admin capabilities must be modeled as
  relationships and permissions, not as exclusive account identities.
- Business roles are represented through `OrganizationMember` and organization
  roles.

## 2. Multi-business ownership

- One `Person` can own or work in multiple `Organization` records.
- Business dashboard data and mutations must always use the selected active
  business context.
- Users must not need to log out or switch accounts to move between customer,
  owner, or staff workflows.
- Multi-business users must operate through explicit, server-validated active
  business selection.

## 3. Employee consent

- The current direct staff membership flow is a privacy and consent gap.
- Future team membership must use an invitation flow with explicit
  accept/decline behavior.
- A business may suspend or remove a membership relationship.
- A business must never delete or take ownership of the underlying `Person`
  account.
- Employee accounts remain owned by the individual person.

## 4. Professional profile

- Public professional data must be separate from private `Person` data.
- A professional should be publicly visible only when all eligibility conditions
  are satisfied:
  - active person
  - active organization
  - accepted active membership
  - assigned/bookable services
  - explicit opt-in or public visibility flag
- Normal customers must never appear in public person/professional search.
- Professional visibility must be scoped to real business relationships.

## 5. Booking from professional profile

- Bookings from professional profiles must always be created inside business
  context.
- A valid professional booking must resolve to:
  - `organizationId`
  - `branchId`
  - `branchServiceId`
  - `memberId`
  - `customerId`
- REZNO must not create free-floating bookings against a professional outside an
  organization, branch, and service offering.

## 6. Reviews

- Reviews remain booking-scoped.
- Reviews must require a verified completed booking.
- Future review dimensions should include:
  - `staffRating`
  - `serviceRating`
  - `cleanlinessRating`
  - `valueRating`
- Staff ratings should contribute to a professional record only when the review
  is tied to a completed booking with a real `memberId`.
- Anonymous or unverified public reviews must not be introduced.

## 7. Search and routing

- Start professional public pages with the business-scoped route:
  `/[businessSlug]/staff/[staffSlug]`.
- Add `/professionals/[slug]` later only after privacy, slug collision, and
  eligibility rules are fully solved.
- Professional search must include only active, visible, bookable professionals.
- Search must never expose normal private accounts.
- If a professional works in multiple businesses, discovery should show the
  active businesses where the professional is currently bookable.

## 8. Phased implementation

1. Role-neutral registration + dashboard entry cleanup.
2. Add/manage businesses from the same account.
3. Employee invite + accept/decline.
4. Professional profile inside business.
5. Multi-dimensional completed-booking review.
6. Professional search.
7. Cross-business professional profile, only if still needed.

## 9. Backwards compatibility and safety defaults

- Existing `OrganizationMember` records should be treated as active operational
  memberships for current business workflows.
- Existing staff memberships must not become publicly searchable professional
  profiles automatically.
- Future professional visibility must default to private/off until explicit
  eligibility and visibility controls are implemented.
- Removing or suspending a membership must not delete historical bookings,
  reviews, or audit-relevant records.
- Historical bookings and reviews should remain linked to the original booking,
  organization, service, customer, and member context for auditability.
- Platform administrator and super administrator permissions remain separate
  from organization membership roles.
- Legacy direct staff membership should not be treated as employee consent for
  future public professional search.