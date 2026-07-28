# AI Gate D — Browser and Device Evidence

Status: `ACTIVE — AUTHOR IMPLEMENTATION`
Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`
Migration 52: `NOT CREATED`

## Web evidence

Gate D visual evidence was captured from a locally owned Next.js production build/server. Gemini was mocked only at the REZNO API boundary, so provider calls remained `0`.

Production evidence:

- `docs/ai/baselines/gate-d-baselines.json`
- images under `docs/ai/baselines/gate-d/`
- human review record: `docs/ai/gate-d-baseline-human-review.json`

Captured source SHA: `dc7cd33f82c7410bdc458bab44f5825d6414ff7a`.

States covered: `8/8` — disabled, loading, success with citations, refusal, no-results, timeout, quota/rate limited, provider unavailable, light/dark, compact/desktop, `ar/en/ckb`, RTL/LTR.

Human visual review: `8/8 PASS`. The review checked visible language, direction, theme, no development/error overlay, no cropped/collapsed layout, no sensitive data, no provider endpoint/key/model exposure, and no unsupported booking/payment/admin/platform capability claim.

## Device evidence

Physical device testing is not claimed in Gate D author implementation unless separately executed. Current status: `NOT_RUN — EXTERNAL DEVICE ACCESS NOT PROVIDED`. iOS Simulator/Android emulator/export checks are attempted when local tooling is available and reported as evidence or external gap.
