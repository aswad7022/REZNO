# Gate 8B — Customer Visual Audit

## Audit outcome

Gate 8B applies the Gate 8A system to customer-facing Web and Mobile surfaces
without changing their workflows. The audit used the canonical source matrix,
production builds/exports, automated contracts, and real browser captures.

| Finding | Before | Gate 8B treatment |
| --- | --- | --- |
| Web failure states | offline, not-found, forbidden, and customer error used separate structures | one truthful state hierarchy with semantic tone, live behavior, and retry |
| Customer loading | generic dashboard geometry | customer hierarchy skeleton with stable cards and responsive sections |
| Location permission | loading remained actionable; denial was quiet text | busy/disabled control, reduced-motion spinner, associated warning status |
| Customer payments | English literals and raw provider enums dominated the UI | localized hierarchy, semantic intent status, responsive amounts, server-truth wording |
| Theme hydration | stored dark preference could disagree with the server icon and accessible name during hydration | deterministic hydration snapshot, then the resolved client theme |
| Mobile avatar | local purple/red colors and underspecified action meaning | semantic theme roles, neutral/destructive separation, direction, 44×44 targets |
| Mobile startup | Arabic-only retry label in all locales | locale-owned retry copy and assertive session error |
| Hosted payment | retry target could be shorter than 44px | 44×44 semantic retry while preserving state truth |
| Restaurant reservation | local red/green values | shared danger/success roles |

## Responsive and direction review

- Desktop Web: 1440×900.
- Compact Web: 390×844.
- iOS-like: 390×844.
- Android-like: 412×915.
- Direction: `ar`/`ckb` RTL and `en` LTR.
- Themes: light and dark.
- Motion: normal visual samples; reduced-motion behavior is verified by the
  Gate 8A native resolver and Web `motion-reduce` automated contracts because
  the capture harness could not emulate the media preference reliably.

No capture is approved when it has horizontal overflow, clipped primary copy,
ambiguous directional controls, hidden focus, or a Mobile action below 44px.

## Baseline organization

Gate 8B captures live under `docs/stage8/baselines/gate8b/`. The manifest
records platform, requested viewport, exact output pixel dimensions, locale,
direction, theme, state, reduced-motion mode, and SHA-256 for every image. The
images contain no secrets, private customer data, tokens, file paths, or
production/staging mutations.

The final manifest contains 16 verified captures: 14 Web, one iOS-like, and
one Android-like; nine light and seven dark; ten RTL and six LTR; five Arabic,
five Kurdish, and six English. Production hydration was also exercised with a
persisted dark preference: the resolved control and theme were correct with
zero browser console errors. The production public-error capture contains no
development issue overlay.
