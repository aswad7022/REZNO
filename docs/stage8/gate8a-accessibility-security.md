# Gate 8A — Accessibility and Security Review

## Accessibility contract

- Page roots preserve correct `lang` and `dir` for `ar`, `en`, and `ckb`.
- Keyboard focus is never represented by color alone and remains visible in
  forced-color mode.
- Shared controls have at least a 44px target in the foundation contract.
- Loading, invalid, disabled, and selected states must be semantic as well as
  visual (`aria-*`, native accessibility state, text, or icon).
- Status colors have accompanying text/icon semantics.
- Reduced motion removes spatial transforms and delays while preserving state
  changes.
- RTL uses logical layout and direction-aware navigation icons.
- Meaningful imagery requires alternative text; decorative icons are hidden
  from assistive technology.

Automated contracts cover locale direction, focus/busy/invalid/disabled state,
minimum targets, and reduced-motion behavior. ESLint provides JSX accessibility
regression coverage. The local browser audit covers representative public,
auth, admin, compact, and mobile error surfaces. Full device/browser/contrast
matrix closure remains Gate 8D.

The final public desktop browser audit observed 26 interactive controls with
zero unnamed controls and zero controls below 44 CSS pixels. The compact
marketplace audit observed 42 controls with no undersized target or horizontal
overflow; the Expo error surface exposed one 44px retry target. Auth and Admin
snapshots also preserved Arabic RTL and semantic form/navigation names.

Checkboxes and radios retain a compact 16px visual indicator while their
associated label/wrapper owns the 44×44 hit area. The global rule explicitly
excludes checkbox, radio, and hidden inputs so table rows and dense forms are
not visually inflated.

Deterministic WCAG calculations now enforce at least 4.5:1 for primary CTA
endpoints, primary text, and error/success/warning/information soft-state pairs
in both web themes and both native themes. The light action and status roles
were darkened where the original values missed AA, while inverse action text
remains cream.

## Security review

Gate 8A adds no network destination, cookie flow, storage path, API endpoint,
database operation, permission, secret, or logging behavior.

- Gate 7A origin policy remains unchanged.
- The mobile visual capture was allowed to fail closed instead of adding a
  development origin.
- Screenshot fixtures contain only synthetic local marketplace records and a
  synthetic admin display; no token, cookie, password, connection string, or
  real user data is visible.
- Design tokens contain public presentation values only.
- No embedded remote font, image, analytics, or tracking dependency was added.
- No business logic or authorization condition was changed.

Final review must confirm the diff contains presentation, documentation,
baseline, and test files only and contains no P0/P1/P2 security issue.
