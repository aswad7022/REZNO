# Gate 9A Environment Matrix

Status: `ACTIVE — AUTHOR IMPLEMENTATION`

Gate 9A validates variable names and posture, not secret values. Findings must
never print raw secret contents.

| Variable | Category | Timing | Secret | Notes |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | database | `REQUIRED_NOW` | yes | Required for local/CI disposable PostgreSQL and production readiness; production placeholders fail. |
| `BETTER_AUTH_SECRET` | auth/cursor | `REQUIRED_NOW` | yes | Production placeholders fail; current authenticated cursor families derive domain-separated signing keys from this secret. |
| `BETTER_AUTH_URL` | auth | `REQUIRED_NOW` | no | Must match the active origin in later release gates. |
| `REZNO_AI_ENABLED` | Gemini | `REQUIRED_GATE_9B` | no | Staging/production remain disabled in Gate 9A. |
| `REZNO_AI_KILL_SWITCH` | Gemini | `REQUIRED_GATE_9B` | no | Kill switch remains highest authority. |
| `REZNO_AI_GEMINI_ENABLED` | Gemini | `REQUIRED_GATE_9B` | no | Does not activate staging/production in Gate 9A. |
| `REZNO_AI_DEPLOYMENT_ENV` | Gemini | `REQUIRED_GATE_9B` | no | Only `local`, `staging`, `production` are legal. |
| `GEMINI_API_KEY` | Gemini | `REQUIRED_GATE_9B` | yes | Not required for Gate 9A CI. |
| `GEMINI_MODEL` | Gemini | `REQUIRED_GATE_9B` | no | Must remain on the Gate C allowlist. |
| `REZNO_PUSH_TOKEN_ENCRYPTION_KEY` | APNs/FCM | `REQUIRED_GATE_9D` | yes | External validation deferred. |
| `REZNO_PUSH_RECEIPT_HMAC_SECRET` | APNs/FCM | `REQUIRED_GATE_9D` | yes | External validation deferred. |
| `REZNO_PUSH_RECEIPT_PROVIDERS` | APNs/FCM | `REQUIRED_GATE_9D` | no | External validation deferred. |
| `REZNO_PAYMENT_PROVIDER` | payments | `REQUIRED_GATE_9C` | no | `DETERMINISTIC_TEST` is forbidden in production. |
| `REZNO_STORAGE_PROVIDER` | storage | `REQUIRED_GATE_9C` | no | `DETERMINISTIC_TEST` is forbidden in production. |
| `REZNO_PLATFORM_RUNTIME_ENABLED` | Platform Runtime | `REQUIRED_GATE_9D` | no | Gate 9A requires this to remain inactive. |
| `EXPO_PUBLIC_REZNO_API_BASE_URL` | Mobile/EAS | `REQUIRED_GATE_9D` | no | Physical/provider validation is deferred. |
| `NEXT_PUBLIC_APP_URL` | Web | `REQUIRED_GATE_9C` | no | Release candidate URL alignment. |

## Fail-closed rules

- Unknown `REZNO_*`, `GEMINI_*`, `NEXT_PUBLIC_*`, `EXPO_PUBLIC_REZNO_*`,
  `BETTER_AUTH_*`, `DATABASE_URL*`, and `VERCEL_*` variables are reported.
- Empty present values fail.
- Unknown deployment values fail and are never downgraded to `local`.
- Conflicting deployment values fail.
- Production placeholders fail.
- Production deterministic payment/storage providers fail.
- Staging/production AI activation fails in Gate 9A.
