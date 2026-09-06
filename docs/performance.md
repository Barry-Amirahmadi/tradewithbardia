# Performance Budget — Phase 0

Master prompt §47, §72. Numbers are measured against the production build
(`npm run build && npx next start`), not estimated.

A budget is only useful if it is checked. Right now checking is manual — the
commands are below. Automating it belongs with CI, not with Phase 0.

---

## Measured baseline (2026-09-05)

| Metric | Measured | Budget | Headroom |
|---|---|---|---|
| Initial JS, gzipped (`/fa`) | **187 KB** | **220 KB** | 33 KB |
| Initial JS, raw | 600 KB | 700 KB | 100 KB |
| Scripts on first load | 9 | 12 | 3 |
| HTML document, raw | 86 KB | 110 KB | 24 KB |
| Fonts, total woff2 | 131 KB (3 faces) | 140 KB | 9 KB |
| Route chunk, per section page | < 5 KB | 40 KB | — |
| Renderer chunk (canvas) | 5 KB | 25 KB | 20 KB |
| Smooth scroll (Lenis) | 32 KB | 40 KB | 8 KB |

Most of the 185 KB is React plus the Next runtime. The application's own code
is a small fraction of it, which is the intended shape: the heavy parts of this
product are content and canvas work, not framework.

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

- Backing store capped at **DPR 2**. Beyond that the pixel cost climbs faster
  than anything becomes visible.
- Redraw is dirty-checked: no progress change and no camera easing means no
  draw, even while the loop is subscribed.
- Full-scene redraw per frame is acceptable at this scale (66 candles, ~9
  annotations). Revisit with layer caching if a scene exceeds ~500 candles.
- Suspends when the section leaves the viewport.

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
