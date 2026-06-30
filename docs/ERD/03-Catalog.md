# Catalog Domain

## Aggregate Root

Service

## Entities

- Category
- Service
- BranchService
- ServiceAddon
- ServiceVariant

---

## Relationships

Category
    │
    └── Service
            │
            └── BranchService
                    │
                    ├── EmployeeService
                    └── BookingItem

---

## Rules

A Service belongs to one Category.

A Service may exist in many Branches.

Each Branch defines its own:

- Price
- Duration
- Availability

The same Service can have different prices in different Branches.