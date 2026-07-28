# AI Gate D — Rollout and Rollback Checklist

Status: `ACTIVE — AUTHOR IMPLEMENTATION`
Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`
Migration 52: `NOT CREATED`

## Rollout prerequisites

- Independent security review of Gate D PR.
- AI Gates A-D focused tests green.
- Full CI and Vercel green on the reviewed SHA.
- No unresolved review threads.
- Provider key remains local-only unless a later owner decision authorizes staging/production.
- Staging/production AI flags remain closed by default.
- No Stage 6 runtime activation.

## Rollback

- Set `REZNO_AI_KILL_SWITCH=true` or unset `REZNO_AI_ENABLED`.
- Confirm `/customer/assistant` returns the disabled/coming-soon state.
- Confirm `/api/ai/customer/discovery` does not acquire budget, search Marketplace, or call Gemini.
- Confirm telemetry remains prompt/response/key/PII free.

