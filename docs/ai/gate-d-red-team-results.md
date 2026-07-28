# AI Gate D — Red-Team Evaluation Plan and Results

Status: `ACTIVE — AUTHOR IMPLEMENTATION`
Stage 6 runtime: `DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`
Migration 52: `NOT CREATED`

The deterministic red-team corpus is implemented in `features/ai/gate-d.ts` and enforced by `tests/ai/unit/gate-d-end-to-end-closure.test.ts`.

## Required result

- Safety/privacy pass rate: `100%`.
- Pre-provider refusal cases: `16/16`, each with `providerRequestCount=0`, Marketplace calls `0`, provider calls `0`.
- Post-provider grounding rejection cases: `7/7`.
- Outage/rollback drills: `7/7`.
- Grounded success control: `1/1`.
- Live provider request budget: maximum `3` across Gate D.

## Corpus families

- Direct prompt injection.
- Indirect injection in business/service text.
- System-prompt/key extraction.
- Tool or permission escalation.
- Booking/order/payment/message/admin requests.
- Direct and obfuscated PII across `ar/en/ckb`.
- Unicode, zero-width, full-width, email, phone, JWT, cookies, API keys, and internal IDs.
- Invented businesses, prices, ratings, availability, and external URLs.
- Missing/unknown/duplicate citations and malformed/extra provider output.
- Cross-request state reuse and long input bounds.
- Environment posture conflicts and kill switch flips.

## Live evaluation

Gemini live smoke is optional and local-only. Current author status: `NOT_RUN — LOCAL SECRET UNAVAILABLE`. No prompt, response, key, customer data, or real Marketplace data is printed or persisted when smoke is skipped or run.

