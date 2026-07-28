# AI Gate B Local Runbook

Gate B is local-only in this PR.

## Enable locally

Set server-only values in ignored `.env.local`:

```bash
REZNO_AI_ENABLED=true
REZNO_AI_GEMINI_ENABLED=true
REZNO_AI_GATE_B_LOCAL_ONLY=true
REZNO_AI_KILL_SWITCH=false
GEMINI_MODEL=gemini-3.6-flash
```

`GEMINI_API_KEY` must exist in `.env.local` but must never be printed, committed, copied to clients, or configured in Vercel/GitHub/EAS for Gate B.

## Disable

Any of these disables Gate B:

- unset `REZNO_AI_ENABLED`;
- unset `REZNO_AI_GEMINI_ENABLED`;
- unset `REZNO_AI_GATE_B_LOCAL_ONLY`;
- set `REZNO_AI_KILL_SWITCH=true`;
- remove `GEMINI_API_KEY`;
- remove `GEMINI_MODEL`.

## Quota and outage

Gemini quota/rate limit returns a safe temporary-limit message. Timeout returns a retryable timeout message. Permission/key failures fail closed without exposing provider internals to users.

No billing upgrade is authorized for Gate B.

