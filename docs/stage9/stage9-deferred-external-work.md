# Stage 9 Deferred External Work

Status: `GATE 9C — EXTERNAL WORK RECORDED`

Gate 9A records deferred external work honestly; it does not claim these items
as completed.

| Item | Status | Earliest gate | Notes |
| --- | --- | --- | --- |
| Stage 6 staging runtime activation | `CLOSED` | complete | Runtime is enabled on staging with 13/13 schedules and two accepted scheduled OIDC runs; production remains disabled. |
| Stage 7 physical device validation | `DEFERRED_BY_OWNER` | 9D | Simulator/local checks do not replace physical-device evidence. |
| Stage 7 APNs/FCM/store-provider validation | `DEFERRED_BY_OWNER` | 9D | No provider activation in Gate 9A. |
| Staging/production AI activation | `DISABLED` | 9D or later owner decision | AI Gates A-D are code-closed; the Gate 9C release candidate keeps the kill switch engaged. |
| Gemini production key provisioning | `NOT_CONFIGURED` | 9D or later owner decision | Gate 9C neither creates nor uploads provider secrets. |
| Payment production adapter | `NOT_IMPLEMENTED/NOT_CONFIGURED` | 9D or later product decision | Offline methods remain available; deterministic payment is test-only and forbidden in the release candidate. |
| Managed storage production adapter | `NOT_IMPLEMENTED/NOT_CONFIGURED` | 9D or later product decision | Storage fails closed; deterministic storage is test-only and forbidden in the release candidate. |
| Mobile production API origin | `NOT_APPROVED` | 9D | Preview remains pinned to staging; store builds remain fail-closed. |
| PR #100 | `PROTECTED · OUT_OF_SCOPE` | none | Must not be modified, synchronized, merged, or rebuilt here. |

Any later gate that resolves one of these items must add fresh evidence and
security review for that specific activation path.
