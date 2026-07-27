# Gate 8D — Motion, Visual QA and Stage Closure

## Boundary

- Presentation-only: `YES`
- Business logic/API/auth/permissions: `UNCHANGED`
- Stage 6 runtime: `NOT ACTIVATED`
- Stage 7 external validation:
  `DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED`
- Migration 52: `NOT CREATED`
- Artificial intelligence: `NOT STARTED`

Gate 8D closes the inherited visual system. It does not close or weaken the
external device/provider evidence still owed by Stage 7.

## Motion contract

Web and native mobile consume one bounded vocabulary: 90, 140, 220, and 320 ms.
Entering content uses the shared emphasized-deceleration curve; normal state
changes use the standard curve. Page movement is limited to eight CSS pixels.
Animation is reserved for orientation, feedback, and state continuity.

Transform and opacity are the default animated properties. Layout animation,
unbounded loops, decorative parallax, and independent component timing values
are prohibited. A progress indicator may loop only while the corresponding
operation is genuinely pending.

With reduced motion, entrance offsets, scale feedback, scrolling, transitions,
and non-progress animation are removed. The final state remains visible and
operable without waiting for an animation.

## Final visual matrix

The Gate 8D matrix contains 24 production PNG captures: eight each from
Chromium, Firefox, and WebKit. Each browser covers compact phone, large phone,
tablet portrait, tablet landscape, desktop, wide desktop, and a 200% reflow
equivalent. The matrix spans `ar`, `en`, and `ckb`; RTL and LTR; light and dark;
Admin and Business roles; forms, tables, dialogs, communications, platform
truth, and dense dashboard content.

The 200% case uses half the CSS viewport dimensions while retaining a
device-scale factor of one. It tests the same reflow constraint as 200% zoom
without misrepresenting screenshot pixel dimensions.

Every capture is made by a harness that:

1. refuses a dirty checkout;
2. records the exact Git SHA;
3. runs `next build`;
4. starts and owns `next start` on an exclusive loopback port;
5. records the PID, port, `BUILD_ID`, build-manifest digest, and harness/script
   digests;
6. uses fixed disposable fixtures with `fixtures.example` identities and null
   phone numbers;
7. executes DOM, locale, state, overflow, accessibility, error, reduced-motion,
   and performance preflight;
8. captures twice and requires byte-identical output;
9. strips metadata and authenticates PNG bytes, dimensions, entropy, and SHA;
10. requires a separate image-by-image human review record.

## Accessibility closure

The structured browser evidence checks one main landmark and one page heading,
named interactive controls, 44-by-44 CSS pixel touch targets, unique IDs, the
localized skip link, `:focus-visible`, reduced motion, and the absence of
horizontal overflow. Dialog and sheet primitives keep Radix focus trapping and
restoration while using logical placement in RTL/LTR.

Keyboard review covers skip navigation, sequential focus, menus, command
palette, dialogs, and Escape dismissal. State surfaces retain `status`,
`alert`, `aria-busy`, explicit labels, and non-color meaning.

## Visual performance closure

These measurements are repeatable local lab evidence, not field Core Web
Vitals. Per capture budgets are:

- CLS at most `0.10`;
- FCP at most `3000 ms`;
- LCP at most `4000 ms` when exposed by the browser;
- load at most `5000 ms`;
- at most five long tasks.

Firefox/WebKit may not expose buffered LCP. In that case FCP and navigation load
are the documented alternatives. Captures wait for fonts and the final
semantic state; non-progress animation must be zero at capture.

## Closure rule

Gate 8D and Stage 8 close only after the Draft PR is reviewed independently in
a separate clean worktree at an exact head SHA, all P0/P1/P2 findings are fixed,
review threads are zero, local and remote checks are green, the reviewed SHA is
merged, and post-merge checks succeed.

The visual manifest intentionally records the production-attested source SHA
used to build and capture the baselines. The final PR head may add one
evidence-only commit after that source SHA, limited to the generated Gate 8D
manifest, PNG baselines, and human-review record. The Gate 8D validator rejects
any source, fixture, harness, application, or documentation change after the
attested source SHA so stale evidence cannot close the gate.
