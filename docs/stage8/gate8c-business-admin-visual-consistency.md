# Gate 8C — Business and Admin Visual Consistency

## Result and boundary

Gate 8C is a presentation-only consistency pass over existing Business and
Admin capabilities.

- Base: Gate 8B merge commit `903cbf8de413145ba83f652e23f41616f79c90d3`
- Presentation-only: `YES`
- Gate 8D: `NOT STARTED`
- Artificial intelligence: `NOT STARTED`
- Migration count: `51`
- Migration 52: `NOT CREATED`
- Stage 6 runtime: `NOT ACTIVATED`
- PR #100: `UNCHANGED`

The inherited Stage 7 state remains:

`DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED`

## Business workspace

The existing permission-aware Business shell, sidebar, compact navigation,
breadcrumbs, command palette, search, business switcher, language/theme
controls, notifications, and messages now opt into one scoped operational
surface contract. That contract standardizes semantic cards, form controls,
dense tables, sticky table headers, logical alignment, long-copy wrapping,
dialog/sheet height, reduced motion, and focus behavior without changing any
workflow.

Business booking, availability, operational-block, commerce, communication,
payment, restaurant, review, team, and settings surfaces retain their service
and authorization contracts. Touched feedback roles use the Gate 8A semantic
success, warning, error, and information tokens.

The compact Business header now constrains the active-business selector and
uses the bottom application navigation as the compact messages entry point.
This keeps the menu, selector, notifications, locale, theme, and account
controls inside the physical viewport without changing their authorization or
workflow contracts. Admin restaurant results now include a localized final
empty state instead of rendering an unexplained blank region.

## Admin workspace

- Replaced the fixed Arabic-only wrapping header with a permission-filtered
  navigation model localized in `ar`, `en`, and `ckb`.
- Added deterministic active-page state, keyboard focus, a compact Sheet menu,
  logical close placement, and locale-aware start-side placement.
- Added language and light/dark controls while retaining server-side permission
  filtering.
- Unified headers, loading, unexpected-error, permission-denied, not-configured,
  success/error feedback, empty results, wide audit metadata, and semantic
  elevation.
- Added shared operational state, metric-grid, and keyboard-scrollable region
  primitives for dense administration.
- Removed scoped slate/white/amber/indigo/emerald literals where an established
  Gate 8A semantic role exists.

## Operational truth

Platform Jobs says explicitly that code and durable configuration records do
not prove automatic execution. Platform Operations renders the database runtime
state and explains both disabled and unexpectedly enabled states without
claiming deployment connectivity. No scheduler, worker, provider, runtime
secret, or production setting is changed by Gate 8C.

## Invariants

No business logic, API contract, authentication, authorization, permission,
provider, schema, migration, Stage 6 runtime, Stage 7 external validation,
staging, or production state changed. Customer surfaces are not redesigned by
this gate.

## Visual-evidence integrity

Gate 8C baselines are generated only from a local `next build` plus `next
start` production server connected to a disposable 51-migration database.
Fixtures use synthetic `@rezno.invalid` identities and deterministic,
non-sensitive product data. Capture uses a fixed Chromium version, exact
viewport dimensions, reduced motion, settled fonts, final-state selectors, and
viewport screenshots rather than stitched full-page screenshots.

The manifest binds route, viewport, locale, direction, theme, role, expected
state, required landmarks, forbidden states, decoded PNG format, actual
dimensions, SHA-256, pre-capture page measurements, visual metrics, and a
per-capture human review record. The validator rejects mismatched or unusable
evidence rather than treating a self-recorded hash as semantic proof.
