# Gate 8D Visual and Performance Audit

## Closed debt

- Motion durations and easing are centralized across Web and Mobile.
- Dashboard and public-profile entrance motion no longer embeds independent
  timing literals.
- Dialog, sheet, menu, and select transitions use shared duration tokens and
  reduced-motion fallbacks.
- Directional controls use logical inline placement; directional icons mirror
  in RTL.
- A localized skip link is available for `ar`, `en`, and `ckb`.
- Browser evidence covers Chromium, Firefox, WebKit, seven viewport/reflow
  categories, light/dark, RTL/LTR, and representative Business/Admin states.

## Performance method

The owned production harness records buffered layout shift, paint, LCP where
available, navigation load, and long tasks. It waits for fonts, network idle,
the semantic state marker, and two animation frames. Captures fail their
documented budgets rather than silently relaxing them.

The audit explicitly avoids claiming field Core Web Vitals. A browser that does
not implement buffered LCP is evaluated with FCP and navigation load, and that
absence is retained as `null` in the evidence.

## Deferred outside Stage 8

- Stage 6 runtime activation.
- Stage 7 physical-device and external provider validation.
- Artificial-intelligence implementation.
- Production performance telemetry and store-release evidence.
