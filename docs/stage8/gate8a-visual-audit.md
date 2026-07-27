# Gate 8A — Actual Visual Audit

Audit date: `2026-07-27`

Base commit: `124c570b640a209fa4a04270e5e46a216077677b`

The audit combined source inspection, real local rendering, responsive
viewports, and Expo web rendering. It did not rely on historical reports.

## Inventory

- 102 web route pages
- 50 shared web components
- 13 native mobile screen modules
- 27 bundled native product icons
- 11 root web icon/SVG assets
- 51 database migrations

## Findings before Gate 8A

| Area | Observed state | Gate 8A response | Remaining gate |
| --- | --- | --- | --- |
| Web identity | Violet/indigo tokens and gradients diverged from the established mobile gold/cream/ink identity. | Replaced global semantic palette and shared dashboard accents with warm premium roles. | Per-surface polish in 8B/8C. |
| Mobile identity | Strong gold/cream/ink system already existed, but info/focus roles and the 32px spacing step were absent. | Added semantic focus/info pairs and completed the spacing contract. | Remove surface-local colors in 8B. |
| Hard-coded color debt | 6 web and 350 mobile literal color/rgba references were found. | Central primitives now have a canonical target and tests. Bulk surface migration is intentionally not hidden in the foundation gate. | 8B/8C. |
| Direction | Locale mapping was correct (`ar`/`ckb` RTL, `en` LTR); 23 logical-property references and 70 physical-direction references were found in web sources. | Canonical direction and logical-layout rules are documented/tested. | Surface-by-surface correction in 8B/8C. |
| Focus/state | Shared controls had focus, disabled, and invalid handling, but no global busy/status contract. | Added semantic focus, busy, invalid, status, forced-color, and 44px target rules. | State visual QA in 8D. |
| Motion | Web card timing was literal; native observed reduce-motion but had no pure reduction contract. | Added semantic durations/easing and deterministic web/native reduced-motion resolution. | Final motion QA in 8D. |
| Elevation | Web and mobile shadows used unrelated local values. | Added named soft/raised web shadows and retained native semantic shadow factory. | Surface normalization in 8B/8C. |
| Responsive | Existing surfaces use Tailwind breakpoints and native window dimensions, but shared max-width/gutter values were implicit. | Added max-width/gutter and compact/wide contracts. | Device matrix in 8D. |
| Images/icons | Native has a coherent product icon set and directional arrows; web mixes Lucide with platform marks. | Established usage rules; no content asset was replaced without product approval. | Asset polish in 8B/8C. |

## Rendered surfaces

The public landing page, sign-in page, admin overview, and compact marketplace
were rendered against a disposable local PostgreSQL database migrated to 51/51
and populated with non-production demo fixtures. The Expo web app was rendered
at 390×844 and correctly failed closed rather than trusting an unapproved origin.

The final public desktop accessibility pass found 26 interactive controls, no
unnamed control, and no target below 44 CSS pixels. The compact marketplace
found 42 controls, zero undersized controls, and no horizontal overflow. The
Expo error state exposed one 44px retry action. Auth and Admin snapshots
retained Arabic `lang="ar"` and `dir="rtl"`, semantic control names, and the
same minimum-target contract. Automated contracts separately prove English LTR
and Kurdish RTL direction, both web/native reduced-motion resolution, and WCAG
AA contrast for the semantic action/status pairs in light and dark themes.

The independent pre-merge audit caught two foundation gaps before closure:
several light action/status pairs were below 4.5:1 and the earlier global rule
guaranteed only control height. The corrected foundation uses AA-safe semantic
roles and enforces both inline and block minimums; deterministic regression
tests now prevent either issue from returning.

A follow-up review also caught that applying those minimums directly to every
`input` enlarged native checkbox/radio indicators. The final rule excludes
checkbox, radio, and hidden inputs, keeps each indicator compact, and assigns
the 44×44 hit target to its label or an explicit table-cell wrapper.

No staging or production database, provider, runtime, or secret was touched.
The disposable database, synthetic Admin identity, and generated export
artifacts were deleted after capture.

## Deliberate follow-up debt

Gate 8A does not claim that all 350 native hard-coded colors or all 70 web
physical-direction references are defects. They are an inventory for
surface-aware review: many are content-specific or directional by design.
Gates 8B and 8C must migrate only values that semantically belong to the shared
system. Gate 8D must compare final screenshots across locale, theme, browser,
size, and reduced-motion matrices.
