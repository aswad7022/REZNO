# Gate 8C — Visual Audit

## Evidence matrix

`docs/stage8/baselines/gate8c-baselines.json` indexes production-captured,
format-authenticated evidence organized under
`docs/stage8/baselines/gate8c/`.

The manifest contains 24 actual local-product captures from a Next.js
production server. Every file has PNG magic bytes and decodes as PNG. The
manifest binds its SHA-256, decoded dimensions, route, viewport, locale,
direction, theme, role, expected state, required and forbidden selectors,
pre-capture browser checks, visual-distribution metrics, and human review.
The capture tool deliberately records a new image as `PENDING`; only the
separate post-capture visual inspection may change it to `PASS`, and the
validator rejects pending evidence.

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
blocked unless fonts are loaded, landmarks match, forbidden loading/development
overlays are absent for final states, locale/theme/direction match, root
overflow is zero, primary content does not collapse, animations are stopped,
and unacceptable console/page/resource failures are zero. A pixel-level check
then rejects incorrect signatures, dimensions, blank or near-uniform images,
and unintentionally narrow content.

These baselines are Gate 8C evidence. Formal cross-browser/device-size visual
regression and final Stage 8 closure remain Gate 8D work and are not started
here.
