# Gate 8C — Accessibility and Security Review

## Accessibility

- All primary and compact navigation actions retain a minimum 44×44 target.
- Active navigation uses `aria-current="page"` and a text/icon treatment rather
  than color alone.
- Admin navigation labels are translated in `ar`, `en`, and `ckb`.
- Compact navigation opens from logical start: left in English LTR and right in
  Arabic/Kurdish RTL. Directional arrows mirror in RTL.
- Focus rings remain visible; Sheet close placement uses logical `end`.
- Wide audit/table regions are named, keyboard-focusable scroll regions.
- Table headers are sticky with logical alignment; long localized and dense
  values wrap instead of clipping the viewport.
- Loading uses `aria-busy`; errors use `alert`; informational, warning, and
  successful states use live status semantics.
- Motion continues to honor `prefers-reduced-motion`.
- Dialog and Sheet content stays within the dynamic viewport and scrolls
  internally when required.
- Compact Business header controls use bounded widths; the root page has zero
  horizontal overflow in Arabic and Kurdish RTL as well as English LTR.
- Empty restaurant administration results expose a localized live status
  instead of a blank visual region.

## Security and privacy

- Permission filtering remains server-derived before navigation items are
  passed to the client. Visual hiding is not used as authorization.
- Error states do not render exception messages or stack traces.
- Audit metadata remains the existing server-redacted view. Baselines contain
  synthetic or non-sensitive fixture data only.
- Destructive operations keep their existing confirmation/action contracts and
  destructive semantic role.
- No token, cookie, provider payload, financial secret, connection string,
  personal contact value, or runtime credential is added to source, logs, or
  visual evidence.
- Production baseline preflight rejects credential-shaped text, realistic
  international/local phones in Arabic or Latin digits, and email outside the
  approved `fixtures.example` domain. Capture reports counts and hashes, never
  session-cookie values.
- Every baseline uses fixed disposable `fixtures.example` accounts, valid
  fixed UUIDs, fixed dates, explicit `Visual Fixture` names, and null phones.
  The fixture contains no random or wall-clock-derived value and removes all
  users, domain records, sessions, and rate-limit buckets after each pass.
- The capture process cannot target an existing localhost server. It owns
  `next build`/`next start`, binds Git/BUILD_ID/script/build hashes and child
  ownership in an integrity-checked attestation, and terminates the child.
- Visible language is verified independently of `<html lang>` through exact
  localized text, forbidden foreign text, and cookie/browser/Person-language
  agreement. Technical untranslated identifiers are explicit per baseline.
- No authorization, API, action, persistence, provider, or runtime code changes.

## Runtime truth

Stage 6 runtime remains inactive. Stored jobs and schedules are presented as
records, not proof of scheduler or worker activity. The UI cannot infer an
active provider or worker from database rows alone.

Final diff review accepts no P0, P1, or P2 security/accessibility finding.
