# Gate 9B Staging Smoke

Status: `PENDING AUTHENTICATED STAGING INPUT`

Gate 9B smoke uses only synthetic `gate9b` fixture data on the approved staging
origin and database. It must be rerunnable, scoped by fingerprint, and cleaned
up by the same fingerprint.

## Required smoke coverage

- Marketplace public discovery.
- Customer onboarding.
- Business/Admin authorization.
- Booking.
- Restaurant reservation.
- Commerce cart, checkout, order, and deterministic payment capability.
- Notifications and messages.
- Storage/media capability truth.
- Platform runtime/jobs.
- AI disabled and fail-closed.
- `ar`, `en`, and `ckb` surface checks.
- Mobile API contracts against staging without claiming physical-device QA.

Smoke must not perform real push delivery, Gemini calls, App Store/Play Store
actions, production writes, or real payment/storage provider calls.
