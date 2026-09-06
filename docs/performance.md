# Performance Budget — Phase 0

Master prompt §47, §72. Numbers are measured against the production build
(`npm run build && npx next start`), not estimated.

A budget is only useful if it is checked. Right now checking is manual — the
commands are below. Automating it belongs with CI, not with Phase 0.

---

## Measured baseline (2026-09-06, EPIC 06)

**Transfer and parse are separate budgets.** Until EPIC 05 this file stated one
raw-byte ceiling for the document, and the EPIC 04 review showed that was
measuring the wrong thing: the home page read 109 kB raw against a 110 kB
budget and looked like it was out of room, while the bytes that actually
crossed the network were 21.9 kB. Raw size still matters — it is what a weak
phone parses — but it is not the transfer cost, and conflating them produced a
false alarm.

### Per route

| Route | Raw | Raw budget | Gzip | Gzip budget |
|---|---|---|---|---|
| `/en` home | **86 kB** | 110 kB | **17.5 kB** | 30 kB |
| `/en/systems` | 45 kB | 90 kB | 8.8 kB | 25 kB |
| `/en/setups` library | 41 kB | 90 kB | 9.8 kB | 25 kB |
| `/en/setups/[slug]` | 44 kB | 90 kB | 10.0 kB | 25 kB |
| `/en/academy` landing | 49 kB | 90 kB | 11.0 kB | 25 kB |
| `/en/academy/[slug]` lesson | 84 kB | 110 kB | 20.4 kB | 30 kB |
| `/en/about` placeholder | 19 kB | 40 kB | 4.7 kB | 15 kB |

The home page fell from 109 kB to 86 kB in this epic because the Trading System
Story moved to `/systems` and home kept a condensed teaser (§22). Splitting the
document was the headroom fix the EPIC 04 review recommended.

### Shared

| Metric | Measured | Budget |
|---|---|---|
| Initial JS, gzipped | **188 KB** | 220 KB |
| Renderer chunk (canvas) | 3.4 KB | 25 KB |
| Command palette chunk | 5 KB | 25 KB |
| Search index chunk (per locale) | lazy, on first search | 40 KB |
| Fonts, total woff2 | 131 KB (3 faces) | 140 KB |

### Renderer and chart budgets — EPIC 05

| Constraint | Rule | Measured |
|---|---|---|
| Active renderer instances per page | **≤ 1** | library 0, setup detail 1, **academy 0** |
| SSR'd full-fidelity chart fallbacks | **≤ 1 per document** | home 1 (hero), everywhere else 0 |
| Card preview payload | ≤ 1 kB per card | ~340 B glyph |
| Setup dataset in a shared client component | **forbidden** | route-scoped |

The last row is the EPIC 04 defect stated as a rule. Threading the concept
dictionary through `Navbar` put 18.2 kB into every route's RSC payload,
including placeholder pages that render none of it. Search providers now
receive a **loader** rather than data (`lib/search/lazy.ts`), so nothing is
fetched until someone searches and nothing is serialized into any document.
Verified: `/en/about` contains no concept or setup copy at all.

### Why the HTML is large

The hero's static SVG fallback is inlined into the document — 66 candles plus
annotations. That is a deliberate trade: it buys a complete, meaningful chart
with zero JavaScript and no layout shift, and it is the thing that makes the
§50 fallback chain real rather than decorative. If the document budget is ever
under pressure, reduce the fallback's candle count before removing it.

## Navigation (EPIC 02)

Navigation is global infrastructure — it exists on every page — so its budget
is separate from the page's.

| Metric | Measured | Budget |
|---|---|---|
| Command palette chunk | **5 KB** raw, code-split | 25 KB |
| Added runtime dependencies | **0** | 0 |
| Scroll listeners added | **0** | 0 |
| RAF chains added | **0** | 0 |
| React renders per scroll frame | **0** | 0 |

The palette is code-split behind `next/dynamic` and never server-rendered: a
page that is never searched does not download it. The mega panels render only
while open, so six panels' worth of links never sit in the tab order.

No WebGL, Three.js or canvas instance is created by navigation.

## Animation

| Metric | Target |
|---|---|
| Frame rate during hero scrub | 60 fps on `high`, ≥ 30 fps on `low` |
| Active RAF loops | **exactly 1** (`lib/motion/frame-loop.ts`) |
| React renders per scroll frame | **0** |
| React renders per full hero scroll | ≤ 9 (one per stage change) |
| Canvas draws while suspended | 0 |

The last two are structural, not aspirational: scroll position is written to
`style`/`dataset` rather than state, and a suspended renderer unsubscribes from
the frame loop entirely rather than being called and returning early.

## Canvas workload

- Backing store capped by the **render budget**, not by a constant: DPR 2 on
  HIGH, 1.75 on MEDIUM, **1 on LOW**. On a 2x display that is a quarter of the
  fill rate, and fill rate is what actually separates a smooth scrub from a
  stuttering one on a weak device.
- Redraw is dirty-checked: no progress change and no camera easing means no
  draw, even while the loop is subscribed.
- Camera easing is budgeted too. A slower glide is more frames drawn *after*
  the user has stopped scrolling, so the easing factor rises as the budget
  falls (0.12 → 0.18 → 0.30) and LOW settles in roughly a third of the frames.
- The atmospheric field is a fixed seeded array of at most 260 points, drawn
  as 1–1.5px rects with no per-frame allocation, and only during the first
  three beats. It is off entirely on LOW.
- Full-scene redraw per frame is acceptable at this scale (66 candles, ~9
  annotations). Revisit with layer caching if a scene exceeds ~500 candles.
- Suspends when the section leaves the viewport **or the tab is hidden**. The
  two are tracked separately and reconciled in one place, so returning to a
  backgrounded tab does not restart a renderer that is three viewports away.

## Hero pacing

The scroll track is `240vh` on mobile and `320vh` from 48rem up. It is not one
number because a touch scroll is a physically longer gesture than a wheel: the
same nine beats over three viewports reads as a corridor on a phone.

Under reduced motion the track collapses to its own content height in CSS, so
the section never renders tall and then shrinks after hydration.

## Fonts

Self-hosted by `next/font`, `display: swap`, subset per script.

**Known waste:** all three faces are declared on the document shell, so a
Persian reader downloads JetBrains Mono's Latin subset and an English reader
downloads Vazirmatn's Arabic subset — roughly **45 KB neither will render**.
Fixing this means scoping the Persian face to the locale wrapper, which
`next/font`'s variable pattern does not do out of the box. Logged, not fixed;
it is within budget today.

## Images

No raster images ship in Phase 0. When they arrive:

- AVIF/WebP via `next/image`, declared in `next.config.ts`
- Hero-adjacent images: ≤ 150 KB each after compression
- Everything below the fold lazy-loaded
- Every image has explicit dimensions — no layout shift

## WebGL (placeholder, Phase 2+)

Not installed. When a WebGL renderer joins the registry:

| Metric | Budget |
|---|---|
| Library + renderer chunk, gzipped | ≤ 150 KB |
| Loaded on | `high` profile only |
| Context | Suspended off-screen, destroyed on unmount |
| Fallback | Must degrade to `frames` → `canvas` → `static` without a reload |

The chain already supports this: `pickRenderer` walks past a renderer recorded
as failed, so a lost context descends one tier instead of collapsing to a
static image.

## How to check

```bash
npm run build && npx next start --port 3000
```

Then, for the JS payload actually shipped to a route:

```bash
curl -s http://localhost:3000/fa | grep -oE '/_next/static/[^"]*\.js' | sort -u
```

Sum those files from `.next/static`, gzipped, and compare against the table.
