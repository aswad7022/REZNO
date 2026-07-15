# Customer review lifecycle

Gate 2C supports one immutable customer review per completed generic-service
booking. Customer, organization, service, member, booking status, and moderation
status are never accepted from the request; they are derived from the owned
booking. The existing unique `Review.bookingId` constraint is the concurrency
and replay boundary. An identical retry returns the stored review, while a
different payload conflicts.

New reviews require an active, onboarded customer and internally consistent
booking, branch, service, organization, and optional member relationships.
Historical reviews remain readable to their customer after a business, service,
or professional becomes inactive. Public discovery still requires an active,
marketplace-visible business and includes only `VISIBLE` generic-service
reviews whose tenant relationships agree.

Reviews are one-time and do not gain edit/delete semantics in this gate. Owners
and managers can maintain one current public response; staff and receptionists
cannot. A response is public only while its review is public. Admin moderation
continues to require `BUSINESSES_MANAGE` and records each visibility change in
`AdminAuditLog` in the same transaction as the review update.

Restaurant/cafe reviews, review media, and mobile business review management
remain outside this lifecycle.
