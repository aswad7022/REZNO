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
- No authorization, API, action, persistence, provider, or runtime code changes.

## Runtime truth

Stage 6 runtime remains inactive. Stored jobs and schedules are presented as
records, not proof of scheduler or worker activity. The UI cannot infer an
active provider or worker from database rows alone.

Final diff review accepts no P0, P1, or P2 security/accessibility finding.
