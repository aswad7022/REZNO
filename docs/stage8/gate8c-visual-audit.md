# Gate 8C — Visual Audit

## Evidence matrix

`docs/stage8/baselines/gate8c-baselines.json` indexes production-captured,
format-authenticated evidence organized under
`docs/stage8/baselines/gate8c/`.

The manifest contains 24 actual local-product captures from a harness-owned
Next.js production build/server. Every file has PNG magic bytes and decodes as
PNG. The manifest binds its SHA-256, decoded dimensions, route, viewport,
locale, direction, theme, role, expected state, required and forbidden
selectors/text, measured state marker, pre-capture browser checks,
visual-distribution metrics, two-pass determinism, production attestation, and
human review. The capture tool deliberately records a new image as `PENDING`;
only a fresh external review record may change it to `PASS`. The record binds
all 24 current PNG hashes and a distinct observation for visible language,
state, viewport/theme/direction, privacy, and overflow/overlay.

The matrix covers:

- Business desktop and compact navigation;
- Admin desktop and compact navigation;
- light and dark themes;
- Arabic and Kurdish RTL plus English LTR;
- booking/restaurant and commerce surfaces;
- communications and platform operations;
- tables, forms, and dialogs;
- loading, empty, error, and permission-denied states;
- long localized labels and dense fixture data.

The earlier JPEG-encoded and development-server artifacts were removed. The
replacement set uses only exact viewport screenshots, so fixed headers and
navigation are not duplicated by full-page stitching. The four reported
failures now show:

- a completed Admin access grant form instead of a skeleton;
- full-width Arabic and English compact Admin overviews;
- a viewport-contained Business booking card with no repeated or clipped
  horizontal segment.

The review also found and corrected two real presentation gaps: compact
Business header controls previously expanded the root by 81 pixels, and an
empty Admin restaurant result rendered no final-state explanation. Both are
now asserted by page preflight and Gate 8C source regressions.

## Review criteria

Each capture is checked for semantic contrast, horizontal page overflow,
necessary local table scrolling, clipping, focus order, named controls, 44×44
targets, destructive-action clarity, truthful status copy, layout stability,
reduced-motion compatibility, and absence of sensitive data. Page capture is
blocked unless fonts are loaded, landmarks match, the expected state marker is
visible in the viewport, conflicting controls are absent, forbidden
loading/development overlays are absent, locale-specific text is visible,
foreign-language text is absent, browser/cookie/Person locale agree, root
overflow is zero, primary content does not collapse, animations are stopped,
and unacceptable console/page/resource/privacy failures are zero. A
pixel-level check then rejects incorrect signatures, dimensions, blank or
near-uniform images, and unintentionally narrow content.

The communications evidence scrolls to the real campaign-history empty state.
The localized empty marker is visible; the create form, campaign result, table,
and loading marker are forbidden inside that capture viewport. It is not
relabeled form evidence.

These baselines are Gate 8C evidence. Formal cross-browser/device-size visual
regression and final Stage 8 closure remain Gate 8D work and are not started
here.
