# AI Gate C — Secrets and Rotation Runbook

Gate C does not copy `GEMINI_API_KEY` to GitHub, Vercel, EAS, staging, or production. Local smoke may use an ignored `.env.local` value only.

## Readiness

Readiness reports only:

- `configured`
- `not-configured`

It must never expose the key, prefixes, suffixes, length, model internals, or provider error bodies.

## Rotation

1. Add the new server-only `GEMINI_API_KEY` to the target secret manager when a later gate authorizes that environment.
2. Keep the kill switch active.
3. Deploy code that reads the key per request.
4. Run synthetic smoke with public fixture data only.
5. Remove the old key from the secret manager.
6. Verify bundle and log scans show no key material.

Gate C creates the provider client per operation, so a running process does not intentionally keep an old key in global client state.

## Emergency disable

Set `REZNO_AI_KILL_SWITCH=true` or `REZNO_AI_GATE_C_KILL_SWITCH=true`. The kill switch is checked before provider network calls.
