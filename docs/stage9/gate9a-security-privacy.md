# Gate 9A Security and Privacy Review

Status: `ACTIVE — AUTHOR IMPLEMENTATION`

## Security invariants

- Authenticated Customer, Business Owner, and Admin identities remain distinct.
- Tenant-owned resources are tied to one fixture organization and one customer.
- AdminAccess is read-focused and does not grant platform-runtime activation.
- Payment and storage rows use deterministic test providers only.
- AI is disabled before Marketplace search or provider calls.
- Stage 6 runtime is not enabled.
- No staging or production database writes are performed.
- No provider secrets are required by Gate 9A validation.

## Privacy controls

- Fixture email addresses use `rezno.invalid`.
- Phone-like fields use explicit non-phone markers.
- Visual, document, and test evidence must not include real customer, employee,
  payment, message, or location data.
- Error messages and environment validation findings name variables but never
  print secret values.
- Secret and client-bundle scans remain part of final validation.

## Regression areas rechecked by inherited gates

- Authorization and tenant isolation.
- CSRF, origin, session cookie, and trusted-origin policy.
- Rate limits and server-side budget acquisition.
- Cursor authentication and pagination bounds.
- Idempotency for bookings, messages, cart/checkout, payments, and media.
- Body-size limits and malformed input rejection.
- SSRF/media URL policy and upload validation.
- Logging boundaries for prompts, provider responses, cookies, tokens, payment
  identifiers, and private IDs.
- AI provider boundaries, grounding, privacy gate, rate/concurrency limits, and
  kill switches.

## P0/P1/P2 closure standard

Gate 9A cannot be marked review-ready if a reproducible P0, P1, or P2 remains
in the final diff, tests, CI, environment matrix, fixture cleanup, migration
baseline, or deferred-work record.
