# Gate 9A Performance Budgets

Status: `ACTIVE — AUTHOR IMPLEMENTATION`

Gate 9A budgets are bounded, local, and non-invasive. They are intended to fail
on clear regression only; they are not staging or production load tests.

| Budget | Limit | Reason |
| --- | ---: | --- |
| Marketplace public collection limit | `50` | Prevent unbounded public catalog queries. |
| Admin page limit | `100` | Keep oversight lists bounded. |
| Booking availability window | `31` days | Avoid unbounded slot expansion. |
| AI provider concurrency | `2` | Protect the Gemini Free Tier and serverless capacity. |
| AI/HTTP body read limit | `4096` bytes | Preserve bounded request parsing. |
| Media upload size | `10 MiB` | Keep local/mobile upload evidence inside approved limits. |
| Next.js route count | `320` | Detect accidental broad route growth before release. |
| Mobile export module count | `1200` | Detect clear bundle expansion during final baseline. |

## Validation

`evaluateGate9APerformanceSnapshot()` rejects snapshots that exceed these
limits. The Gate 9A unit test checks current route/module counts and verifies
that synthetic regressions fail.

The final author validation should also record observed Next.js build route
counts, iOS/Android/Web export module counts, and audit results in
`gate9a-closure-evidence.md`.
