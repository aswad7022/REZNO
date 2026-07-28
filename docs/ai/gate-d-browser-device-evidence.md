# AI Gate D — Browser and Device Evidence

Status: `ACTIVE — AUTHOR IMPLEMENTATION`
Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`
Migration 52: `NOT CREATED`

## Web evidence

Gate D visual evidence is captured from a locally owned Next.js production build/server. Gemini is mocked only at the REZNO API boundary, so provider calls remain `0`.

Planned manifest:

- `docs/ai/baselines/gate-d-baselines.json`
- images under `docs/ai/baselines/gate-d/`
- human review record: `docs/ai/gate-d-baseline-human-review.json`

States covered: disabled, loading, success with citations, refusal, no-results, timeout, quota/rate limited, provider unavailable, light/dark, compact/desktop, `ar/en/ckb`, RTL/LTR.

## Device evidence

Physical device testing is not claimed in Gate D author implementation unless separately executed. Current status: `NOT_RUN — EXTERNAL DEVICE ACCESS NOT PROVIDED`. iOS Simulator/Android emulator/export checks are attempted when local tooling is available and reported as evidence or external gap.

