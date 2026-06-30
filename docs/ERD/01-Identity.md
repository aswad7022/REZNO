# Identity Domain

## Aggregate Root

Person

## Entities

- Person
- OrganizationMember
- Role
- EmployeeProfile

## Relationships

Person
│
├── OrganizationMember
│      │
│      ├── Role
│      └── EmployeeProfile
│
└── Booking

## Notes

- Better Auth owns authentication only.
- REZNO owns Person.
- One Person may belong to multiple Organizations.
- One Person may own multiple Organizations.
- One Person may also be a customer.