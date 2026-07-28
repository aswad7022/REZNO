# AI Gate B — Grounded Customer Discovery Assistant

Status: Draft PR author implementation.

Gate B introduces the first bounded, user-facing REZNO AI surface for customer discovery. The assistant is read-only, customer-scoped, and grounded only in public Marketplace results returned by REZNO server-side tools.

## Scope

- Customer asks a short `ar`, `en`, or `ckb` marketplace discovery question.
- REZNO server normalizes, classifies, and rejects unsafe input before any provider call.
- REZNO server executes read-only Marketplace search.
- Gemini receives only the sanitized question and a compact public result list with temporary `citationId` values. Internal Business, Person, Owner, Organization, booking, order, payment, and operational IDs are never included in the provider DTO.
- REZNO server validates provider JSON and citations, rejects model-generated URLs or unverifiable free-text claims, and builds the final user answer, citation reasons, and links from trusted server-side Marketplace data.

The model cannot call tools directly. It cannot book, order, pay, message, read private records, change ranking, or mutate data.

## Runtime controls

All controls are server-only and closed by default:

- `REZNO_AI_ENABLED=true`
- `REZNO_AI_GEMINI_ENABLED=true`
- `REZNO_AI_GATE_B_LOCAL_ONLY=true`
- `REZNO_AI_KILL_SWITCH` must not be `true`
- `GEMINI_API_KEY` must exist server-side
- `GEMINI_MODEL` must be explicit

Staging and production remain closed. CI, Vercel, EAS, and client bundles do not receive Gemini secrets. No `NEXT_PUBLIC_` or `EXPO_PUBLIC_` Gemini key is allowed.

Before any Gemini network call, the route acquires server-side Gate B budgets tied to the authenticated Person and the service-wide Gemini Free Tier pool. Request rate limits use REZNO's existing distributed rate-limit backend, and concurrency is held until provider completion, timeout, cancellation, or failure, then released idempotently.

## Privacy boundary

Gate B refuses locally before Gemini when input contains emails, obfuscated emails, phone-like values in Arabic or Latin digits, secrets, JWT-like values, sessions, bookings, orders, payments, admin/staff/platform requests, or prompt-injection attempts. It normalizes Unicode before detection and does not send customer profiles, bookings, orders, payments, messages, cookies, sessions, tokens, private addresses, or private identifiers to Gemini.

No Migration 52 is created.
