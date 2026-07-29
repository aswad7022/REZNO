# Gate 9A Release Inventory

Status: `ACTIVE — AUTHOR IMPLEMENTATION`

This inventory is test-backed by `tests/stage9/unit/gate9a-final-integration-baseline.test.ts`.

| Area | Surfaces | Critical routes | Primary evidence |
| --- | --- | --- | --- |
| Identity, onboarding, RBAC, admin access | Customer, Business, Admin, Mobile | `/onboarding`, `/onboarding/business`, `/select-business`, `/admin/access` | Identity unit/integration/http tests plus Gate 9A direct fixture. |
| Business operations and bookings | Customer, Business, Admin, Mobile | `/marketplace`, `/book/[offeringId]`, `/business/bookings`, `/admin/bookings` | Business operations and bookings suites plus Gate 9A direct fixture. |
| Restaurant reservations | Customer, Business, Admin, Mobile | `/[slug]/reserve`, `/business/reservations`, `/business/tables`, `/admin/restaurants` | Restaurant suites plus Gate 9A direct fixture. |
| Commerce, checkout, orders, payments | Customer, Business, Admin, Mobile | `/business/commerce`, `/business/commerce/store`, `/business/commerce/products`, `/business/commerce/orders`, `/admin/commerce`, `/customer/payments` | Commerce/payment suites plus Gate 9A direct fixture. |
| Notifications, messages, communications | Customer, Business, Admin, Mobile | `/customer/notifications`, `/customer/messages`, `/business/messages`, `/admin/communications` | Stage 4 suites plus Gate 9A direct fixture. |
| Storage, media, upload/recovery | Customer, Business, Admin, Mobile | `/media/[assetId]`, `/business/profile`, `/business/commerce/products` | Storage/media/mobile upload suites plus Gate 9A direct fixture. |
| Platform jobs and operations | Admin | `/admin/platform-jobs`, `/admin/platform-operations` | Stage 6 suites plus Gate 9A runtime-deferred fixture. |
| Stage 8 visual/localization/accessibility | Public, Customer, Business, Admin, Mobile | `/`, `/admin`, `/business`, `/customer` | Stage 8 visual closure contracts. |
| AI customer discovery | Customer Web, Mobile coming-soon | `/customer/assistant`, `/api/ai/customer/discovery` | AI Gate A-D suites plus Gate 9A disabled-provider check. |

## Orphan and documented-only policy

Gate 9A unit tests compare the inventory routes and mobile entry points against
the repository. A listed route or mobile entry point that is missing fails the
inventory test. A newly added critical route must be added to this inventory and
mapped to tests before Stage 9 closure.
