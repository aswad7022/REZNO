# Gate 8D Accessibility and Security Review

## Accessibility

The final motion system respects the platform reduced-motion preference on Web
and Mobile. Shared primitives use logical inline placement, visible focus,
minimum touch dimensions, semantic state roles, and localized skip navigation.
Radix remains responsible for dialog/sheet focus trapping, Escape behavior, and
focus restoration.

The production browser matrix measures landmarks, headings, accessible names,
duplicate IDs, target sizes, reduced motion, overflow, locale/direction, and
semantic final-state markers before each screenshot. The evidence is
supplemented by a separate human review because pixel hashes cannot establish
meaning or accessibility by themselves.

## Security and privacy

- Capture is restricted to an owned loopback production process.
- The harness refuses external localhost servers and dirty source trees.
- The attestation binds Git SHA, `BUILD_ID`, PID, port, build manifest, capture
  script, and harness.
- Fixture identities use reserved `fixtures.example` email addresses, fixed
  UUIDs/timestamps, and null phone numbers.
- Screenshots are metadata-free PNGs and never record cookies, session tokens,
  database URLs, image payloads, or production/staging data.
- Console, page, resource, and overlay errors are capture failures.
- Captures run only against a disposable local PostgreSQL database.

No API, authorization, permission, schema, migration, runtime activation,
provider validation, secret rotation, or artificial-intelligence work is part
of this gate.

## Residual truth

Laboratory browser metrics do not replace field telemetry. Physical-device,
APNs, FCM, receipt, and store-distribution validation remain:
`DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED`.
