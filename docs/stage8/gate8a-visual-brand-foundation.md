# Gate 8A — Visual and Brand Foundation

## Status and boundaries

Author state: `AUTHOR_COMPLETE — DRAFT PR`

This gate establishes a common foundation; it deliberately leaves surface-level
polish to Gates 8B and 8C and formal visual closure to Gate 8D. No product
workflow, API, authorization rule, or persistence model changes here.

Migration count: `51`

Migration 52: `NOT CREATED`

## Brand contract

REZNO uses a warm premium palette shared semantically across web and mobile:

- `primary`: gold action and selected state
- `background`: cream in light mode, near-black ink in dark mode
- `foreground`: high-contrast ink/cream text
- `card` / `elevated`: progressively raised surfaces
- `success`, `warning`, `destructive`, and `info`: status roles that never rely
  on color alone
- `ring` / `focus`: keyboard and assistive-focus indication

The pure contract is recorded in
`design-system/brand-foundation.ts`. Web runtime tokens are CSS custom
properties in `app/globals.css`; native runtime tokens live in
`apps/mobile/src/theme/tokens.ts`. Tests prevent semantic drift between the
contract and native themes and assert the required web roles.

## Typography and language direction

- Web keeps the Cairo-first Arabic-aware stack with Noto Arabic and system
  fallbacks.
- Mobile continues to bundle Noto Kufi Arabic and Noto Sans Arabic UI.
- `ar` and `ckb` are RTL; `en` is LTR.
- Layout code should prefer logical inline properties (`start`, `end`, `ms`,
  `me`, `border-s`, and `border-e`) over physical left/right assumptions.
- Icons that convey direction require explicit RTL/LTR variants or transforms;
  decorative and symmetric icons do not.

## Geometry, elevation, and responsive rules

- Minimum interactive target: 44 CSS/native points.
- Controls: 22px native radius and consistent web rounded controls.
- Cards: 32px native radius with web semantic radius scaling.
- Spacing scale: 6, 10, 16, 20, 26, and 32.
- Web content uses a maximum 80rem measure with fluid 1–2rem gutters.
- Compact layouts are below 640px; wide navigation begins at 1024px.
- Shadows use semantic soft/raised roles and are reduced in dark mode.

## Interaction and status states

- Focus: visible high-contrast ring with offset; forced-colors uses the system
  highlight.
- Hover: color/elevation change only on hover-capable web surfaces.
- Pressed: short translation/scale plus opacity; spatial movement is removed
  when reduced motion is requested.
- Disabled: non-interactive, visibly muted, and exposed through native/web
  disabled state.
- Loading: `aria-busy` state, progress cursor, and no duplicate action.
- Error: destructive border/text and accompanying message/icon.
- Success/warning/info: semantic utilities and mobile theme pairs for foreground
  and soft surface.

## Motion

Durations are 90ms (instant), 140ms (fast), 220ms (normal), and 320ms (slow).
Web `prefers-reduced-motion: reduce` collapses animation/transition duration and
removes hover translation. Mobile observes `AccessibilityInfo` and resolves
reduced durations to zero and press scale to one.

## Icons, images, and logos

- Web feature icons use the Lucide family at consistent inherited color and
  stroke.
- Mobile keeps the existing 27 bundled product icons plus directional arrow
  variants.
- Logos/icons must include maskable and monochrome platform variants already
  present in `public/` and `apps/mobile/assets/`.
- Meaningful images require localized alternative text; decorative icons use
  `aria-hidden` or their native equivalent.
- Product images remain content, not token values, and must continue to use
  existing trusted-media policies.

## Visual baselines

`docs/stage8/baselines/gate8a-baselines.json` indexes screenshots captured from
the real local web/Expo surfaces on a disposable local database:

- public home, Arabic RTL, desktop
- sign-in, Arabic RTL, desktop
- admin overview, Arabic RTL, desktop
- marketplace, Arabic RTL, compact viewport
- Expo mobile session-error state, Arabic RTL, 390×844

The Expo web baseline intentionally records the fail-closed session error
encountered when a development web origin is outside the Gate 7A allowlist. The
allowlist was not relaxed for visual capture.

## Author verification

The final authoritative runs on the author head completed with no failed,
skipped, todo, or cancelled test:

- Gate 8A plus complete Gate 7D unit regression: `107/107`
  (`9 + 89 + 9`)
- all unit tests: `558/558` (`349 + 209`)
- all PostgreSQL integration tests on a fresh disposable 51/51 database:
  `433/433`
- all production-server HTTP/RSC/API tests: `133/133` (`6 + 122 + 5`)
- Root and Mobile TypeScript, full ESLint, and `git diff --check`: `PASS`
- Prisma format/validate/generate: `PASS`, with no schema change
- Next.js production build: `PASS`, `115/115` pages
- Expo dependency check: current; Expo Doctor: `20/20`
- iOS and Android Hermes exports: `1016` modules and `3.4 MB` each
- Expo Web export: `527` modules and `2.1 MB`
- production and Mobile dependency audits: `0` findings each
- final public browser audit: `26` controls, `0` unnamed controls, and `0`
  undersized controls at the desktop baseline
- compact marketplace: `42` controls, `0` undersized, no horizontal overflow;
  Expo error surface: one 44px retry action

The focused foundation tests calculate WCAG contrast from the actual web
OKLCH tokens and native RGB tokens. Primary actions/text and all semantic soft
statuses meet the 4.5:1 AA threshold in light and dark modes. Shared web
controls and navigation now guarantee both a 44px width and height; the native
startup recovery action carries the same explicit minimum.

Checkbox and radio indicators remain visually compact; their associated label
or explicit wrapper provides the 44×44 activation area. Hidden inputs and the
indicators themselves are excluded from the global control-size rule.

Two early environment diagnostics were not accepted as verification: the
first PostgreSQL invocation omitted the local cursor-signing secret, and the
first HTTP invocation omitted the disposable database URL from the test
process. Each failure was reproduced as configuration-only, the database was
recreated, and the complete corrected suites produced the authoritative
`433/433` and `133/133` results above.

## Persistence integrity

No Prisma schema or migration file is changed. The final four migration hashes
must remain:

- 48: `04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192`
- 49: `6cd6ec39cc950600002f0b36529ea08460c539b8ced0176f37fbed2980a74f0c`
- 50: `a16a9c7f2b61c12d35c154e8a4f2f655a568a508118caf46ee88ebe81fbc564d`
- 51: `98fe060f7e9c2e1baa1e2a91c40bcad1a39915454f3b9445a55ef82fb86848f0`
