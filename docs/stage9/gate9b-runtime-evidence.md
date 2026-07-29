# Gate 9B Runtime Evidence

Status: `PENDING AUTHENTICATED STAGING INPUT`

## Accepted Stage 6 runtime state

Before evidence completes:

`DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED`

After evidence completes on staging only:

`STAGING ACTIVATED — PRODUCTION NOT ACTIVATED`

This status must not be written until all runtime checks below pass.

## Registry

Gate 9B requires the accepted Stage 6 registry:

- Platform job types: `23`.
- Platform schedules: `13`.
- Schedules are bootstrapped disabled first.
- Only the 13 accepted staging schedules may be enabled.

## Runtime checks

Evidence must show:

- `assertGate9BActivationPreconditions` passed inside
  `stage9b:runtime-evidence` before the first mutation;
- runtime control initialized with provider `GITHUB_ACTIONS_SCHEDULED_HTTP`;
- two bounded manual cycles completed or were successor-safe no-ops;
- GitHub OIDC runtime invocation observes the exact deployed SHA;
- leases, fencing, generation, retry limits, and idempotency are preserved;
- provider-dependent jobs report `NOT_CONFIGURED` rather than false success;
- no duplicate jobs or stuck leases remain after the scheduled cycle.
