# Gate 8B — Customer Web and Mobile Polish

## Result and boundary

Gate 8B is an author-side, presentation-only customer experience pass based on
the merged Gate 8A foundation. It changes no product capability, business
rule, API contract, authentication or authorization decision, payment truth,
upload truth, notification truth, database schema, or runtime configuration.

- Base: Gate 8A merge commit `9e050584ef0bd46925a5dde616cc387c463c1723`
- Presentation-only: `YES`
- Gate 8C: `NOT STARTED`
- Gate 8D: `NOT STARTED`
- Artificial intelligence: `NOT STARTED`
- Migration count: `51`
- Migration 52: `NOT CREATED`

The inherited Stage 7 state remains:

`DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED`

## Implemented customer presentation

### Web

- Added a customer-specific, accessible state primitive for loading, empty,
  error, offline, permission, information, and success truth.
- Applied it to customer error handling and the public offline, not-found, and
  permission-denied surfaces without exposing exception details.
- Added a customer dashboard skeleton with stable responsive geometry and
  reduced layout shift.
- Refined marketplace loading and geolocation permission feedback with busy,
  disabled, live-region, timeout, and truthful denied/unavailable states.
- Added explicit customer-surface boundaries to public navigation, the landing
  page, marketplace, and the authenticated customer dashboard.
- Made the shared theme toggle hydration-stable so a stored dark preference
  cannot produce a server/client icon or accessible-name mismatch.
- Reworked customer payment list and detail presentation around
  server-authoritative state, semantic status roles, responsive amount cards,
  safe provider wording, empty history, and localized intent, attempt, and
  refund status copy in `ar`/`en`/`ckb`.
- Migrated the public rating treatment from a local amber value to Gate 8A
  warning roles and the public header shadow to the shared elevation role.

### Mobile

- Migrated the account-avatar surface from purple/red literals to the Gate 8A
  semantic light/dark theme roles.
- Added deterministic RTL/LTR text direction to avatar status copy, truthful
  success/warning/error feedback (including neutral cancellation and warning
  expiry), 44×44 action targets, and distinct neutral versus destructive
  actions.
- Kept upload, retry, preview, cancellation, recovery, expiry, and
  server-commit wording truthful; no transfer, attach, or recovery behavior was
  changed.
- Raised hosted-payment retry to the 44×44 target contract while preserving
  server-authoritative confirmation and retry behavior.
- Localized the cold-start session retry action and exposed the startup error
  as an assertive accessibility alert.
- Migrated restaurant reservation success/error roles to semantic tokens and
  corrected the secondary target minimum.

## Reviewed customer surface matrix

| Family | Web | Mobile | Gate 8B outcome |
| --- | --- | --- | --- |
| Public, search, categories, profiles | landing, marketplace, business cards/profile | home, nearby search, details | shared foundation retained; public/search state and permission polish added |
| Booking and restaurant | booking create/detail/history and restaurant profile/menu | booking and restaurant create/manage | existing workflow retained; customer state/target/token contracts verified |
| Commerce and payment | catalog/cart/order and customer payment routes | commerce, cart, order, hosted return | payment truth and responsive state presentation strengthened |
| Account and avatar | customer dashboard/profile/favorites | auth, account, avatar | shared state and avatar semantic migration completed |
| Notifications and messages | customer notification/message pages | native notification/message centers | existing server truth retained; shared Gate 8A hierarchy and target contracts verified |
| Failure and recovery | loading/empty/error/offline/not-found/permission | session, timeout, retry, upload/payment recovery, deep links | truthful live state, retry, direction, and target contracts verified |

No Business/Admin-only surface was visually migrated. The public/shared
primitives changed here are safe customer primitives; Business/Admin-specific
consistency remains Gate 8C.

## Deliberate visual-only exceptions

Decorative illustration colors inside the existing native home and nearby
reference artwork remain local because they describe artwork pixels rather
than semantic interface roles. Text, status, action, focus, border, and
feedback roles touched by Gate 8B use semantic tokens. This avoids an unsafe
mechanical color replacement.

## Security and privacy invariants

- No origin, cookie, token, session, permission, or provider code changed.
- No payment, upload, notification, or message state is promoted to success by
  presentation code.
- No secrets, image contents, local file paths, or sensitive identifiers are
  added to logs or baselines.
- No staging or production mutation was performed.
- PR #100 was not touched.
