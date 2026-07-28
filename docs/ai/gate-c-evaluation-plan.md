# AI Gate C — Evaluation Plan

Gate C evaluations are deterministic and operational. They verify controls around the approved Gate B use case rather than ranking quality.

## Required coverage

- Gate A and Gate B regression chain.
- Flags and kill switch before network.
- Missing, rotated, and invalid key handling.
- Exact model allowlist and no fallback.
- 401/403/429/5xx/timeout classification.
- Retry only for transient unavailable failures.
- Per-Person and service budgets.
- Daily and request-window limits.
- Store unavailable fail-closed behavior.
- Atomic concurrency lease and idempotent release.
- Circuit `CLOSED / OPEN / HALF_OPEN`, recovery, and generation fencing.
- Cross-user/account isolation for leases.
- PII, obfuscated email/phone, JWT, cookie, session, booking, order, and payment refusals.
- Direct and indirect prompt injection regression.
- Invented prices, ratings, URLs, and citations rejection.
- Safe telemetry: no raw prompt/answer/key/provider body/private IDs.
- `ar`, `en`, and `ckb` safe messages.

Live Gemini smoke is limited to at most one successful synthetic public request in author implementation. It must not print the key, prompt, or provider response.
