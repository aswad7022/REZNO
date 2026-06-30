# REZNO Master ERD

## Domain Dependency Map

Platform
│
├── Identity
│
├── Organization
│   ├── Branch
│   ├── BusinessProfile
│   ├── OrganizationSettings
│   └── BusinessHours
│
├── Catalog
│   ├── Category
│   ├── Service
│   ├── BranchService
│   └── ServiceAddon
│
├── Resources
│   ├── EmployeeProfile
│   ├── BranchAssignment
│   ├── EmployeeService
│   └── Leave
│
├── Scheduling
│   ├── Availability
│   ├── BlockedTime
│   └── TimeSlot
│
├── Booking
│   ├── Booking
│   ├── BookingItem
│   └── BookingStatusHistory
│
├── Payments
│   ├── Payment
│   ├── Invoice
│   └── Refund
│
├── Marketplace
│   ├── Review
│   ├── Favorite
│   └── BusinessFollower
│
├── Notifications
│
└── Analytics