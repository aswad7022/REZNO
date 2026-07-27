# Gate 8B — Accessibility and Security Review

## Accessibility contract

- Web state surfaces use a single heading, concise supporting text, semantic
  `status`/`alert` roles, polite/assertive live regions, and an explicit retry
  action.
- Loading state exposes `aria-busy`; spinners stop under
  `prefers-reduced-motion`.
- Geolocation is disabled while a request is active and its denied/unavailable
  state is associated with the control.
- The theme toggle renders one deterministic server/hydration snapshot and is
  enabled only after the client theme store is available, preventing a
  mismatched icon or accessible name.
- Web controls retain the Gate 8A focus-visible outline and 44px global target
  contract.
- Mobile avatar and hosted-payment actions have 44×44 minimum targets and
  hit slop.
- `ar` and `ckb` status copy use RTL writing direction; `en` uses LTR.
- Dynamic payment amounts remain LTR to prevent bidi ambiguity while labels
  follow the page locale.
- Intent, attempt, and refund status enums are translated before display; raw
  provider-state identifiers do not leak into localized customer copy.
- Directional payment-detail navigation points back in LTR and mirrors in RTL.
- Only fully captured or fully refunded intents use the success role. Partial
  capture/refund remains a warning so color never overstates financial truth.
- Long localized text uses wrapping, balanced/prettified headings, flexible
  grids, and truncation only for non-critical compact identifiers.

## Truth and security review

- Customer payment presentation reads server-owned status and verified
  provider events. Redirects never claim financial success.
- Avatar presentation preserves the existing coordinator state machine.
  Offline, timeout, retryable, cleanup, stale-destination, preview failure, and
  unconfirmed commit remain visibly distinct.
- Only an actual completed avatar operation uses the success role;
  cancellation is neutral and expiry remains a warning.
- Error UI does not render raw exception messages; only an opaque server digest
  may be shown.
- Permission denial never appears as success and does not broaden browser or
  native permissions.
- No new external origin, remote image host, storage path, token, cookie,
  telemetry field, or log was introduced.
- No Business/Admin authorization or customer isolation boundary changed.

## Review result

The scoped diff has no accepted P0, P1, or P2 security, accessibility,
direction, responsive, truthfulness, or privacy finding. Gate 8D remains the
formal cross-browser/device visual-closure gate.
