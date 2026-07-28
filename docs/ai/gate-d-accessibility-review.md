# AI Gate D — Accessibility and Locale Review

Status: `ACTIVE — AUTHOR IMPLEMENTATION`
Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`
Migration 52: `NOT CREATED`

## Web assistant

- Form label is explicit and bound to the textarea.
- Status output uses one `role="status"` region with `aria-live="polite"` and `aria-atomic="true"` to avoid repeated announcements.
- Focus moves to the status/result region after submit resolution, error, or cancellation.
- Buttons inherit the REZNO minimum touch target contract (`min-h-11` / `min-w-11`).
- Citations are regular REZNO links, keyboard-focusable, and do not open external origins.
- Offline/session-expired/provider-unavailable/cancelled states have localized `ar/en/ckb` copy.
- RTL/LTR is inherited from the locale shell and validated by visual evidence.
- Reduced motion is enforced by the global Stage 8 contract and the Gate D capture harness.

## Mobile

Mobile remains a native coming-soon surface for AI in Gate D. It does not include a Gemini endpoint, provider SDK, model configuration, or provider-specific secret. Any future mobile AI integration must use the approved REZNO API origin and current session only.

