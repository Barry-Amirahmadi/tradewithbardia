# Architecture

Phase 0. What exists, why it is shaped this way, and what the shape is holding
open for later phases.

---

## Phase model

```
Phase 1  Cinematic marketing site        ← Phase 0 is the foundation for this
Phase 2  Academy + Setup Lab + Dictionary
Phase 3  JournalwithBardia SaaS
Phase 4  Trading analytics
Phase 5  AI analyst
```

The architecture must reach Phase 5 without a rewrite. In practice that means
three seams have to exist before there is anything to put through them: the
content provider, the visualization renderer, and the locale/direction layer.
Phase 0 builds all three and implements the smallest real version of each.

## What Phase 0 deliberately excludes

| Excluded | Why |
|---|---|
| Setup Lab (§23–26) | Its credibility comes from backtest data. Zero backtests exist. Every card would render `INSUFFICIENT SAMPLE` — see PROJECT_RULES §1. |
| Journal / SaaS (§32–39) | Multi-tenant product with auth, a database, uploads and payments. Not a website feature. |
| WebGL (§49) | A slot in the renderer chain. Canvas carries Phase 0 and the seam means WebGL lands without touching callers. |
| Command palette (§16) | Needs an index. There is almost nothing to search yet. |
| Dictionary tooltips (§18) | Needs the Dictionary content model, which is Phase 2. |
| 14 of the 17 documents (§11) | Written when the code they describe exists. Three now; the rest grow with the system. |

## Directory map

```
app/[locale]/          Root layout (html/lang/dir), home, sections, 404
components/
  navigation/          Navbar (5 states), MobileMenu, Theme + Locale toggles
  sections/            Hero (server) → HeroScene (client), Process, Footer
  motion/              SmoothScroll
lib/
  i18n/                Locale config, dictionaries, direction
  motion/              frame-loop, useScrollProgress
  viz/                 Renderer abstraction, canvas + static renderers, scenes
  navigation.ts        The information architecture, as data
  theme.ts             Theme store + pre-paint init script
proxy.ts               Locale resolution and redirect
```

## The visualization engine

The single most important abstraction in the repository, because §21 requires
the same scenes to serve the hero, the Setup Lab, Trading Replay, Academy
lessons and a future dashboard.

```
TradingScene  (data: candles, annotations, stages, provenance)
      │
      ├── resolveSceneState(scene, progress)         pure, no DOM
      │
      └── <TradingAnimation renderer={id} …/>        the façade / registry
            ├── CanvasTradingAnimation   client, imperative, own RAF
            ├── (webgl)     ─┐
            ├── (frames)     ├─ one dynamic() + one case each
            ├── (video)     ─┘
            └── StaticTradingAnimation   server, SVG, no JavaScript,
                                         passed down as children
```

`components/charts/TradingAnimation.tsx` is the only file in the application
that names a renderer implementation. Sections render the façade and pass a
`RendererId`; `HeroScene.tsx` contains no reference to canvas, WebGL, frames or
video. That is what makes "adding a renderer does not touch callers" a checked
property rather than an aspiration — it was not true before the 2026-09-05
audit, when the hero imported the canvas renderer directly.

Both renderers resolve state through the same pure function. That is what
guarantees the server-rendered fallback and the live canvas are the same
picture at the same progress — not a convention, a structural property.

Renderers expose a `TradingAnimationHandle` (`setProgress`, `suspend`,
`resume`) through an `onReady` callback rather than a forwarded ref, because
they are code-split behind `next/dynamic` and a callback crosses that boundary
without depending on how the wrapper handles refs.

**Scenes are data.** `hero-scene.ts` scripts a price path and generates texture
from a seeded PRNG, then *derives* every annotation from the generated candles
— the swing high, the sweep, the broken low, the fair value gap — and asserts
the narrative holds:

- the sweep must clear the liquidity level by a visible margin
- the displacement must actually break the swing low
- the retrace must stall inside the gap, not fill it

If a future edit to the segment table breaks any of those, the module throws at
load and the build fails. A teaching diagram that shows a sweep that never
swept is worse than no diagram.

## Motion

One `requestAnimationFrame` loop for the whole application
(`lib/motion/frame-loop.ts`). Ten sections with ten independent loops means ten
layout reads interleaved with ten writes; one loop means one read phase per
frame.

`useScrollProgress` turns a pinned section into a 0..1 callback using
`getBoundingClientRect`, which already accounts for smooth-scroll transforms —
so it stays correct whether Lenis is running or the browser is scrolling
natively. It is a callback, never state.

## Routing and rendering strategy

```
app/layout.tsx              document shell: <html>, <body>, fonts, theme script
└── app/[locale]/layout.tsx locale shell: <div lang dir>, nav, footer   ● SSG
    ├── page.tsx            home                                        ● SSG
    └── [section]/page.tsx  six marketing sections, dynamicParams=false ● SSG
app/not-found.tsx           bilingual 404, inside the document shell    ○ static
proxy.ts                    redirects any path without a locale
```

**Every public marketing route is prerendered.** Verified against
`prerender-manifest.json`: 14 content routes (`/fa`, `/en`, and six sections
each) plus the framework's `_not-found` and `_global-error`.

Three decisions make that hold, and each was forced by a measured failure:

1. **No request-time APIs in the render path.** An earlier version read the
   locale from a request header in `not-found.tsx`. One `headers()` call opted
   the entire `[locale]` segment into dynamic rendering — `generateStaticParams`
   was still there, still produced nothing, and every marketing page became an
   on-demand server render. Nothing in the render path may call `headers()`,
   `cookies()` or `searchParams` without re-checking the manifest.

2. **The document shell sits above the locale segment.** When
   `app/[locale]/layout.tsx` was the root layout, Next had no styled shell to
   render a not-found into, and fell back to its internal error document —
   which loads none of the application's CSS. The branded 404 was an unstyled
   blank page whose copy existed only in the RSC payload, in production and in
   dev alike.

   The cost is that `<html>` carries no `lang`/`dir`; they sit on the locale
   wrapper instead, where the locale is actually known. Both attributes drive
   the bidi algorithm and assistive technology from any element, so RTL layout,
   Persian font selection and screen-reader language are unaffected.

3. **`dynamicParams = false` on `[section]`.** The section list is closed, so
   an unknown segment is a routing miss rather than a page that renders and
   then throws. A runtime `notFound()` inside an on-demand render puts Next
   back into the error document; a routing miss serves the prerendered
   not-found, which is styled and branded.

**404 behaviour.** Correct `404` status on every miss, styled, branded, and
inside the document shell. Because the root not-found sits above the locale
segment it has no locale to read, so it renders every language and CSS reveals
the one matching a `[lang]` ancestor. Above the locale segment there is none,
so both appear — correct for a path that never resolved to a locale, and each
block carries its own `lang` and `dir`.

## Internationalization

`proxy.ts` guarantees every request carries a locale. `app/[locale]/layout.tsx`
sets `lang` and `dir` on a wrapper element inside the document shell — see the
routing section above for why the shell sits above the locale segment and what
that costs.

Nothing reads the locale from a request header. An earlier version did, and it
cost the entire site its static generation.

Adding Arabic, Turkish or German is: add to `locales`, add a direction entry,
add a dictionary file, and add one line to the `[data-locale-only]` rule in
`globals.css` (CSS cannot compare an attribute against an ancestor's, so the
404's language gate needs one selector per locale). The `Dictionary` type is derived from `en.json`, so a
translation file that drifts out of shape is a type error rather than an
`undefined` rendered into the page.

## Server/client split

The hero is the pattern to copy. `Hero.tsx` is a server component whose only
job is to render the static SVG and pass it as `children` into the client
`HeroScene`. The SVG never enters the client bundle; the interactive shell
starts from real content rather than a hole.

## Performance strategy

Capability is detected once on the client (`lib/viz/capability.ts`) from
reduced-motion, save-data, effective connection type, device memory, core
count, pointer type, viewport and an actual WebGL context probe — not a
user-agent sniff, because a browser can advertise WebGL and still fail to
allocate one.

The resulting profile gates which renderers may be reached. Phase 0 registers
`canvas` and `static`, so every profile currently resolves to canvas. That is
the seam working, not a stub.

## Known gaps

The 2026-09-05 Phase 0 audit raised eleven findings. Items 1–3 below are what
remains open; everything else was fixed and re-verified the same day
(static generation, dark-theme CTA contrast, cross-tab theme sync, the
self-referential radius token, semantic-layer literals, the skip-link target,
the `main` landmark contract, provenance disclosure, the duplicate RAF chain,
the test layer, and the performance budget).

1. **No `og:` image.** Metadata declares OpenGraph but there is no image asset.
2. **Fonts are not scoped per locale.** All three faces load on both locales,
   so roughly 45 KB is downloaded that the reader's script will never use. In
   budget today; see `docs/performance.md`.
3. **The 404 shows both languages.** The root not-found sits above the locale
   segment and has no locale to read. Correct for an unmatched path, slightly
   redundant for `/fa/unknown-section`.
4. **Section pages are placeholders.** Six real routes, honest content, no
   substance yet. They are `noindex` for that reason.
5. **No content provider abstraction yet (§45).** Dictionaries are imported
   directly. The indirection is cheap to add and pointless before there is a
   second source.
6. **Mobile has no separate motion timeline (§51).** Composition and asset
   sizing differ by breakpoint; the scroll timeline is currently shared.
