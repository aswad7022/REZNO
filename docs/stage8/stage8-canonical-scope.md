# Stage 8 — Canonical Scope

## Official boundary

Stage 8 is the visual, brand, motion, responsive, and accessibility closure
stage for the existing REZNO product. It does not add product capabilities,
change business rules, change authorization, activate Stage 6 runtime, or begin
artificial-intelligence work.

The Stage 7 state inherited by this stage remains:

- Gate 7D code: `MERGED`
- Stage 7 external validation: `DEFERRED_BY_OWNER`
- Stage 7 formal closure: `NOT COMPLETED`
- Physical-device and real APNs/FCM/receipt evidence: `EXTERNAL VALIDATION REQUIRED`

Stage 8 does not satisfy, replace, or weaken that external evidence debt.

## Gates

### Gate 8A — Visual and Brand Foundation

- Audit public web, authenticated customer/business/admin web, and native mobile.
- Establish semantic color, typography, spacing, radius, shadow, responsive,
  state, and motion contracts.
- Keep `ar`, `en`, and `ckb` with deterministic RTL/LTR behavior.
- Define focus, hover, pressed, disabled, loading, error, success, warning, and
  information states.
- Respect reduced-motion preferences on web and mobile.
- Record icon, logo, image, and responsive rules.
- Capture organized visual baselines for representative surfaces.
- Add automated contracts for tokens and critical interaction states.

Gate 8A may update shared primitives and presentation-only theme values. It may
not change feature workflows or redesign every product surface independently.

### Gate 8B — Customer Web and Mobile Polish

Customer-facing public, booking, restaurant, commerce, payment, account,
notification, messaging, loading, empty, error, and offline surfaces. Not
started by Gate 8A.

### Gate 8C — Business and Admin Visual Consistency

Business/admin navigation, tables, forms, operations, communications, and
responsive/RTL/accessibility polish. Not started by Gate 8A.

### Gate 8D — Motion, Visual QA and Stage Closure

Final motion, browser/device-size coverage, visual regression, accessibility,
visual performance, independent review, and Stage 8 closure.

Gate 8D is the active closure gate. Its author evidence must be captured from an
owned production build/server and independently reviewed before the gate or
Stage 8 can close.

## Non-negotiable exclusions

- No AI implementation or AI activation.
- No business logic, API contract, authentication, authorization, or permission
  changes.
- No database schema change and no Migration 52.
- No staging or production mutation.
- No Stage 6 runtime activation or secret rotation.
- No Stage 7 external-provider/device validation.
- No change to PR #100.
- No artificial-intelligence implementation before Stage 8 is formally closed.

## Gate 8A exit contract

Gate 8A is author-complete only when the scoped implementation and baselines
exist, the focused and prior-gate regressions pass without skipped/todo/cancelled
tests, all required builds and platform exports succeed, dependency audits are
zero for production/mobile, migrations remain unchanged, and the work is handed
off as an unmerged Draft PR for independent review.
