# Gate 9D — Final Release Closure

Status: `AUTHOR IMPLEMENTATION — EXTERNAL VALIDATION REQUIRED`

Base: `d5a01deafeb19dbc72529dc15d20bc9ef7df9377`
Branch: `codex/stage9-gate9d-final-release-closure`

Gate 9D is the final release-closure package for Stage 9. It does not activate
production, does not change production secrets, does not touch PR #100, and does
not start any later gate. Its purpose is to freeze the release inventory,
go/no-go matrix, operational runbooks, and evidence contract that an independent
reviewer can use to decide whether the release can progress to owner-controlled
external validation.

## Closure decision

The author implementation intentionally returns:

`EXTERNAL_VALIDATION_REQUIRED`

The code, docs, tests, and staging read-only evidence are prepared for
independent final release review. Production readiness is not claimed because
the following external items remain outside this code-only gate:

- physical iOS device validation;
- physical Android device validation;
- APNs/FCM provider validation;
- App Store approval;
- Play Store approval;
- payment production adapter;
- managed storage production adapter;
- approved Mobile production API origin;
- owner decision for production AI activation;
- owner decision for Gemini production secret provisioning;
- owner production-release authorization.

## Evidence contract

`features/stage9/gate9d.ts` defines the Gate 9D release-closure evaluator.
Evidence must be shape-exact and source-bound. The evaluator rejects:

- unknown top-level fields;
- unknown nested fields;
- extra critical-migration hash keys;
- secret-like keys or values at any depth;
- self-attested source evidence;
- mismatched local/GitHub/Vercel/authorized SHAs;
- stale or future-dated source/runtime evidence;
- staging runtime drift, backlog, open alerts, stale leases, or migration drift;
- production runtime or production AI activation inside Gate 9D;
- production mutation or production secret changes;
- incomplete release runbooks.

The CLI `stage9d:final-release-evidence` reads evidence from a local file only,
checks for secret-like material before detailed parsing, and prints a redacted
summary with safe status/reason/finding codes only.

## Release boundary

Gate 9D may produce `READY_FOR_INDEPENDENT_FINAL_RELEASE_REVIEW` only when every
external item has trusted, current, non-self-attested evidence. Until then, the
only correct completed-author state is `EXTERNAL_VALIDATION_REQUIRED`.

Production deployment, provider activation, store submission, push-provider
activation, and AI/Gemini secret provisioning require a separate owner-authorized
task. Secrets, tokens, database URLs, cookies, connection strings, and restore
point identifiers must never be written into Git, comments, logs, or evidence
artifacts.
