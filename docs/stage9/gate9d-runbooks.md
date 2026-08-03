# Gate 9D Release, Rollback, Incident, and Monitoring Runbooks

Status: `AUTHOR IMPLEMENTATION — OWNER AUTHORIZATION REQUIRED FOR PRODUCTION`

These runbooks define the final-release control plane without executing a
production release. They are intentionally operationally conservative.

## Production release preconditions

Do not proceed to production unless all of the following are true:

1. Independent Gate 9D review reports zero P0/P1/P2 findings.
2. GitHub `main`, local Git, Vercel deployment metadata, and authorized release
   SHA match exactly.
3. GitHub Actions and Vercel are green on the release SHA.
4. Staging runtime is stable: runtime `ENABLED`, provider
   `GITHUB_ACTIONS_SCHEDULED_HTTP`, schedules `13/13`, active/overdue jobs `0`,
   open alerts `0`, running attempts/invocations `0/0`, stale leases `0`.
5. Database migrations remain `51/51`, schema drift is `ABSENT`, and Migration
   52 is absent.
6. Stage 7 physical-device and APNs/FCM provider validation is complete.
7. App Store and Play Store approvals exist where required.
8. Payment and storage production adapters are implemented and externally
   validated.
9. The Mobile production API origin is explicitly approved.
10. Production AI/Gemini decisions are explicitly authorized by the owner.
11. A production rollback point and incident owner are documented outside Git.

## Release steps

- Use a separate owner-authorized task for production.
- Never paste secrets into chat, GitHub comments, shell history, logs, evidence
  JSON, or committed files.
- Derive deployment, database, store, and provider metadata from official APIs.
- Reject self-attested evidence.
- Confirm the final go/no-go matrix before any mutation.
- Record redacted evidence only.

## Rollback steps

- Disable runtime/schedules before data remediation.
- Stop new production jobs before attempting rollback.
- Verify no running attempts, invocations, or active leases remain.
- Use official provider/database restore tooling only.
- Reconcile alerts after rollback.
- Record sanitized results without connection strings, tokens, cookies, or full
  provider object identifiers.

## Incident response

- Treat unexpected production writes, provider side effects, leaked secrets, or
  AI/provider activation as P0/P1 until contained.
- Disable affected runtime/provider paths first.
- Rotate exposed credentials through provider consoles; do not expose values in
  chat or GitHub.
- Preserve evidence through redacted identifiers and timestamps.
- File a follow-up issue or PR for root-cause remediation.

## Monitoring plan

During post-release observation, watch:

- scheduled runtime invocation health;
- active/overdue job counts;
- stale or expired leases;
- platform alerts;
- payment/storage/push provider failures;
- auth/session anomalies;
- client-bundle and server-log secret scans;
- DB connection saturation and migration drift.

Production monitoring configuration is outside Gate 9D and requires separate
owner authorization.
