# Organization Domain

## Purpose

Organization represents a business that uses REZNO.

Examples:

- Hair Salon
- Clinic
- Spa
- Car Wash
- Gym
- Restaurant
- Driving School

---

## Aggregate Root

Organization

---

## Entities

- Organization
- BusinessProfile
- Branch
- BusinessHours
- OrganizationSettings

---

## Relationships

Organization
│
├── BusinessProfile (1:1)
│
├── OrganizationSettings (1:1)
│
├── Branch (1:N)
│      │
│      ├── BusinessHours
│      ├── BranchAssignment
│      ├── BranchService
│      └── Booking
│
└── OrganizationMember (1:N)

---

## Rules

Every Organization must have at least one Branch.

Every Branch belongs to exactly one Organization.

A Branch can have many employees.

A Branch can have many services.

Business settings belong to Organization.

Working hours belong to Branch.

Deleting an Organization never deletes bookings.

Soft Delete is required.

---

## Future

Multiple countries.

Multiple currencies.

Multiple languages.

Marketplace visibility.

Subscriptions.

Verification.

Analytics.