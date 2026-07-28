# AI Gate B Evaluation Plan

Gate B evaluations cover:

- `ar`, `en`, and `ckb` intent extraction paths.
- Feature flags, kill switch, missing key, and missing model fail-closed behavior.
- Local refusal before provider for PII, bookings, payments, secrets, staff/admin/platform requests, and prompt injection.
- Public Marketplace grounding and citation validation.
- Unknown citation rejection.
- No-results response.
- Provider malformed output, timeout, quota/rate limit, safety block, and unavailable mappings.
- No side effects: only read-only Marketplace search is allowed.
- Client bundle scan for Gemini credentials.

Live Gemini evaluation is intentionally tiny and local-only: synthetic prompts plus public Marketplace fixtures, capped request count, no logged prompt/response text, model ID/count/latency/tokens metadata only.

