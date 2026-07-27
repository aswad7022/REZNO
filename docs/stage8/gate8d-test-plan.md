# Gate 8D Test Plan

## Automated contracts

- Gates 8A–8D run without skips, todos, cancellations, or failures.
- Unit, PostgreSQL 17, and production HTTP suites remain green.
- Root, Next.js, and Mobile TypeScript; ESLint; and `git diff --check` pass.
- Prisma format/validate/generate causes no schema or migration change.
- Next.js production build and iOS/Android Hermes plus Web exports succeed.
- Expo dependency validation and Expo Doctor succeed.
- Root production and Mobile dependency audits report zero vulnerabilities.
- Secret and privacy scans report zero findings.

## Browser evidence

`npm run visual:capture:stage8d` owns the production build/server and performs
two passes over 24 cases. Each case validates:

- exact route, locale, direction, theme, role, state, and viewport;
- required landmarks and visible text;
- forbidden loading, error, overlay, and foreign-locale states;
- zero horizontal overflow, browser/page/resource errors, and running
  non-progress animations;
- main/heading structure, names, touch targets, duplicate IDs, skip target, and
  reduced motion;
- laboratory CLS/FCP/LCP-or-load/long-task budgets;
- PNG signature, dimensions, entropy, metadata absence, and SHA-256.

`npm run visual:review:stage8d` accepts only a separate 24-entry human review
whose file hashes match the manifest.

## Negative tests

The validator is exercised with a non-PNG payload, a one-pixel blank image,
overflow, a development-console error, an unnamed control, excessive CLS, and
a stale human-review hash. Contract tests also reject missing browser or
viewport coverage, non-token motion, physical directional placement, and a
Migration 52.

## Manual structured review

- keyboard traversal, skip link, focus visibility, dialog trap/restoration, and
  Escape;
- visual review of all 24 images for crop, collapse, repetition, overlays,
  wrong language/theme/direction, or sensitive data;
- reduced-motion comparison;
- RTL/LTR sheet/menu direction;
- narrow reflow and 200% equivalent;
- loading/empty/error/permission surfaces;
- explicit inactive Stage 6 runtime copy.

Physical-device validation is not claimed by Gate 8D. Stage 7 external
validation remains deferred by the owner.
