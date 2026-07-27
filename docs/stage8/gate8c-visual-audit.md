# Gate 8C — Visual Audit

## Evidence matrix

`docs/stage8/baselines/gate8c-baselines.json` indexes byte-authenticated
captures organized under `docs/stage8/baselines/gate8c/`.

The manifest contains 24 actual authenticated local-product captures. It binds
every PNG byte-for-byte with SHA-256 and records locale, direction, theme,
viewport, dimensions, and represented surface families.

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

## Review criteria

Each capture is checked for semantic contrast, horizontal page overflow,
necessary local table scrolling, clipping, focus order, named controls, 44×44
targets, destructive-action clarity, truthful status copy, layout stability,
reduced-motion compatibility, and absence of sensitive data.

These baselines are Gate 8C evidence. Formal cross-browser/device-size visual
regression and final Stage 8 closure remain Gate 8D work and are not started
here.
