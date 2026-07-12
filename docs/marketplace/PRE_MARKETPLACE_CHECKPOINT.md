# REZNO Pre-Marketplace UI Checkpoint

## Checkpoint identity

- Checkpoint date: 2026-07-12 (Europe/Istanbul)
- Base branch: `main`
- Base commit: `a9e01a6300677a7577ef73d3b4deceb7a6358a04`
- Checkpoint branch: `checkpoint/pre-marketplace-rezno-ui`
- Checkpoint commit hash: resolve with `git rev-parse checkpoint/pre-marketplace-rezno-ui`
- Annotated tag: `pre-marketplace-rezno-ui`

The exact checkpoint commit hash is referenced symbolically here because this file is
stored inside that same commit: embedding the final hash in the file would change the
commit hash. The branch and annotated tag both resolve to the immutable checkpoint
commit, and the final checkpoint report records the exact hash.

## Current product state

The mobile application is a dark, gold-accented, Arabic-first Expo experience. The
current local UI state is coherent across onboarding, Home, Nearby discovery and
preview booking, My Bookings, and the shared bottom navigation. RTL placement is
explicit in the key Arabic layouts, and the shared premium motion layer respects the
platform reduced-motion preference.

This checkpoint preserves visual and local-preview work only. It does not introduce
new Marketplace architecture, database changes, API contracts, persistence, or
production booking behavior.

## Completed mobile screens and features

- Premium welcome/onboarding screen and entry actions.
- High-fidelity Home screen with compact header controls, location, search, promo,
  service categories, and marketplace-backed sections.
- Nearby search/results screen with local visual-QA fixtures, map-style preview,
  filters, and responsive RTL layouts.
- Nearby business detail and local preview booking flow for salon, restaurant, and
  clinic-style fixtures.
- My Bookings screen with premium RTL header, filters, upcoming/completed grouping,
  responsive booking cards, status styling, and contextual edit/cancel actions.
- Shared bottom navigation and mobile chrome with localized accessibility labels.
- Premium press, entrance, selection, and reduced-motion-aware interactions.
- Responsive visual QA performed on iPhone simulator widths including approximately
  375dp and iPhone 17 Pro.

## Known UI issues and limitations

- Android and physical-device visual QA were not run during this checkpoint.
- Several business visuals are code-native preview artwork rather than production
  business photography.
- Nearby and booking examples include development-only visual fixtures; they are not
  production records and add no persistence or network writes.
- Empty marketplace-backed Home sections remain possible when the read-only API has
  no data or is unavailable.
- The checkpoint validates iOS bundling, but it is not a signed native build or EAS
  build.

## Existing technical issues

- `apps/mobile/package.json` has an unrelated local script change from Expo start
  commands to native run commands. It is intentionally excluded from the checkpoint.
- `next-env.d.ts` contains a generated Next.js development route-reference change and
  is intentionally excluded.
- `apps/mobile` currently defines no automated test script and contains no scoped
  unit/integration test files, so no mobile automated test suite was available.
- The mobile UI is still concentrated partly in the large `apps/mobile/App.tsx` file;
  architecture refactoring is intentionally deferred.
- No new dependency installation was performed for validation.

## Validation commands and results

| Command | Result |
| --- | --- |
| `npm run lint` | Passed, exit code 0 |
| `cd apps/mobile && npm run typecheck` | Passed, exit code 0 |
| `cd apps/mobile && npx --no-install expo config --type public --json` | Passed; iOS and Android identifiers resolve to `com.rezno.mobile` |
| `cd apps/mobile && npx --no-install expo export --platform ios --output-dir /tmp/rezno-checkpoint-expo-export.B0D3NA` | Passed; 635 modules bundled and iOS export completed |
| `git diff --check` | Passed |
| Mobile automated tests | Not available: no mobile test script or scoped tests exist |

The Expo export was written only to `/tmp`; no export artifact, cache, dependency
folder, generated native project, or build output is included in the checkpoint.

## Files included in the checkpoint

- `apps/mobile/App.tsx`
- `apps/mobile/src/components/mobile-chrome.tsx`
- `apps/mobile/src/components/premium-motion.tsx`
- `apps/mobile/src/screens/fixtures/nearby-visual-qa-fixtures.ts`
- `apps/mobile/src/screens/rezno-home-screen.tsx`
- `apps/mobile/src/screens/rezno-nearby-preview-flow.tsx`
- `apps/mobile/src/screens/rezno-nearby-search-screen.tsx`
- `apps/mobile/src/theme/motion.ts`
- `docs/marketplace/PRE_MARKETPLACE_CHECKPOINT.md`

## Files intentionally excluded from the checkpoint commit

- `apps/mobile/package.json`: unrelated local development-command change; not needed
  by the completed UI implementation.
- `next-env.d.ts`: generated Next.js development type reference.
- Any `.env*` file, secret, dependency folder, cache, simulator data, screenshot,
  native build output, or `/tmp` Expo export.

The excluded tracked files remain present and modified in the working tree. They were
not discarded, restored, overwritten, or staged.

## Marketplace implementation status

New Marketplace implementation has **not started** as part of this checkpoint task.
Existing Nearby/discovery preview UI predates the checkpoint and is preserved only as
part of the current completed mobile visual state. No new Marketplace navigation,
database, API, schema, or architecture work was added.

## Non-destructive recovery and inspection

Inspect the checkpoint without changing the current working tree:

```bash
git show --stat --summary pre-marketplace-rezno-ui
git show pre-marketplace-rezno-ui:docs/marketplace/PRE_MARKETPLACE_CHECKPOINT.md
git diff pre-marketplace-rezno-ui -- apps/mobile
```

Create a separate inspection worktree without switching or resetting the current one:

```bash
git worktree add ../rezno-pre-marketplace-inspection pre-marketplace-rezno-ui
```

Start a recovery branch from the checkpoint after preserving any future uncommitted
work in its own commit or worktree:

```bash
git switch -c recovery/pre-marketplace-rezno-ui pre-marketplace-rezno-ui
```

These commands do not require `git reset`, `git clean`, forced operations, tag
replacement, or modification of `main`.
