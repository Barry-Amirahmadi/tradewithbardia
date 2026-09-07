# PROJECT_RULES

The source of truth for architectural and design rules in this repository.
Where this file and a component disagree, this file wins and the component is
the bug.

Section references (§) point at the TradeWithBardia master prompt.

---

## 1. Never fabricate trading data

The hardest rule in the project, and the one most likely to be broken by
accident rather than intent.

- Every `TradingScene` carries a required `provenance` field: `synthetic`,
  `research`, `demo`, or `verified`. It is not optional and has no default.
- Any scene that is not `verified` must say so on screen. The hero says
  *"Illustrative diagram. Synthetic price data, not a trade record and not a
  performance claim."* directly under the chart, in both languages.
- **Nothing in this repository is `verified` yet, and nothing may be marked
  `verified` until a real sample exists.** As of Phase 0 the underlying
  research has 30+ written setup specifications and zero completed backtests.
  Until that changes, a Setup Lab built from this data would show
  `INSUFFICIENT SAMPLE` on every card — which is why the Setup Lab is not in
  Phase 0 at all.
- No win rate, profit factor, expectancy, R-multiple aggregate, equity curve or
  drawdown figure may be rendered from anything except reconciled trade data
  that passes a minimum-sample check.
- The hero diagram's implied R is a property of a hand-authored teaching
  example. It is not a claim, it is not an average, and it must never be
  presented as one.

§26, §36, §77.1, §77.13.

## 2. Content is data, not components

Adding setup #41 or lesson #100 must mean adding a record, never editing JSX.

- Copy lives in `lib/i18n/dictionaries/*.json`. A string literal rendered to
  the user from inside a component is a bug.
- The navigation IA lives in `lib/navigation.ts` and drives the desktop nav,
  the mobile menu, the footer, route generation and route validation from one
  array.
- Scene geometry lives in `lib/viz/scenes/`. Renderers know how to draw a
  `TradingScene`; they know nothing about which scene.
- **Every trading concept has one canonical identity**, in
  `lib/trading/concepts.ts`. A concept is referenced, never redefined. Before
  EPIC 04 the vocabulary existed in three partial copies — hero beats, process
  steps and nav children — and "liquidity" was three unrelated strings. The
  Setup Lab, Academy, Dictionary, Journal and search all name the same id, and
  a stage id that stops being a concept fails the build.

§24, §41, §45, §77.3.

## 3. Design tokens, three layers, no shortcuts

`app/globals.css` defines, in order: primitives (raw values, each literal
appearing exactly once) → semantic tokens (`light-dark()` over primitives) →
the Tailwind `@theme inline` bridge.

The semantic layer contains no raw literals. Where a semantic token needs a
transparency it derives it — `--scrim` uses `color-mix()` over a primitive
rather than restating the value with an alpha channel.

Nothing in `@theme inline` may alias a token to itself. `--radius-sm:
var(--radius-sm)` compiles to a self-referential custom property that resolves
only because the primitive happens to be declared later in source order.

**Contrast is part of the token contract.** `--accent-contrast` flips with the
theme because the two accents need different foregrounds: the light theme's
`#0060df` carries white at 5.62:1, the dark theme's `#0a84ff` does not
(3.65:1). Any new colour pairing used for text must be checked at 4.5:1 before
it ships.

- A raw colour, spacing, radius, duration or z-index value written inside a
  component is a bug. Use the token.
- Recurring interactive shapes are component classes (`.btn`, `.nav-link`,
  `.site-header`), not repeated arbitrary-value class strings.
- Theme switching only changes `color-scheme`. Every `light-dark()` token
  re-resolves from that one property, so there is no second palette to keep in
  sync and native controls follow automatically.
- The light theme is its own system, not an inversion of the dark one.

§6, §7, §9.

## 4. React does not animate

- Scroll position, scene progress and navbar state never pass through
  `useState`. They are written to a `data-` attribute, an inline style, or an
  imperative renderer handle.
- **Exactly one frame loop exists.** Everything animating subscribes to
  `onFrame` in `lib/motion/frame-loop.ts` — including the canvas renderer. No
  module opens a second `requestAnimationFrame` chain. The one bare `rAF` call
  in the codebase is a bounded one-shot retry for a zero-area measurement, not
  a loop.
- Renderers have an explicit lifecycle: **start → running → suspend → resume →
  destroy**. Suspending unsubscribes rather than setting a flag and continuing
  to be called; destroy is terminal, so a late `resume()` cannot revive an
  unmounted renderer.
- React owns structure, data, and UI state that changes at human speed — menu
  open, active stage label, selected filter.
- Prefer deriving state over synchronising it in an effect. Browser-only values
  with a different server value use `useSyncExternalStore`, not a
  setState-on-mount effect.

§56, §57.

## 5. Every advanced visual degrades

`webgl → frames → video → canvas → static`, defined in `rendererChain`.

- The server always renders the `static` tier. Anything better is an upgrade
  applied after mount on top of working content.
- A renderer that is chosen but fails to arrive must fall back. A 2.5s watchdog
  records the renderer as failed and `pickRenderer` walks past it to the next
  tier — a lost WebGL context descends to frames, not to a static image.
- **Scene consumers name no renderer.** They ask
  `components/charts/TradingAnimation.tsx` for a tier and render what comes
  back. Adding RealChart, FrameSequence, VideoSequence or WebGL is two edits in
  that one file; no section, page or scene changes.
- Heavy rendering suspends when its section leaves the viewport **or the tab
  is hidden**.
- `prefers-reduced-motion` is a stated preference and outranks every capability
  signal. It disables smooth scroll entirely and resolves the renderer chain
  straight to `static` — answered before the chain is walked, not folded into
  the `low` profile, which still permitted an animated renderer. The static
  result is the composition the sequence was building toward, never a stub.
- **A performance profile that changes nothing is not a profile.** `capability`
  picks the renderer; `render-profile` decides what it may spend — pixel ratio,
  gridlines, ambient points, camera easing. LOW gives up the atmosphere and
  keeps the story: candles, structure, annotations, labels, text, CTA.
- Progress enters the engine through `normalizeProgress` and nowhere else.
  `NaN` resolves to the start; infinities clamp in the direction they overshoot.
  A scene must be a function of its current progress, never of the sequence of
  events that produced it.

§48, §49, §50, §58, §77.5.

## 6. Direction is structural

- Use CSS logical properties: `margin-inline-start`, `inset-inline-end`,
  `padding-block`. A physical `left`/`right` in a layout rule is a bug.
- No component branches on `isRTL`. If one needs to, the layout is using a
  physical property somewhere.
- Charts are the documented exception: time runs left-to-right and the price
  axis stays on the right in both directions, because that is what every
  trading terminal does and mirroring it would make the product harder to read.
- Persian text contains no parentheses. This is a house style rule and applies
  to every string in `fa.json`.

§17.

## 7. The server/client boundary is deliberate

- `"use client"` marks the smallest component that genuinely needs the browser.
  Sections are server components that pass server-rendered children into small
  client shells — see `components/sections/Hero.tsx`.
- Data loading, metadata and content rendering stay on the server.
- `lib/i18n/dictionaries.ts` imports `server-only` so the loader can never be
  pulled into a client bundle. The type lives separately in
  `dictionary-type.ts` for client components that need the shape.

§14, §77.11.

## 8. Dependencies are argued for, not assumed

Phase 0 ships exactly one runtime motion dependency: **Lenis**, because the
hero is scrub-driven and raw wheel deltas jump the scene several beats at a
time.

- **GSAP was removed.** It is named in §13, but Phase 0's motion is a canvas
  timeline plus CSS keyframes, and nothing needed it. It returns when the §55
  primitives are built.
- **Three.js is not installed.** The WebGL tier is a slot in the renderer
  chain, not code.
- Toolchain versions are pinned to what the whole chain supports, not to the
  newest number. TypeScript is on 6.x and ESLint on 9.x because
  `eslint-config-next@16` bundles `eslint-plugin-react@7.37`, which does not
  support ESLint 10, and `typescript-eslint` does not yet support TypeScript 7.
  Moving either forward means checking the lint chain first.

§13, §77.12.

## 8a. Navigation is data, not markup

The navigation tree lives in `lib/navigation.ts`. A label written as a string
in a component, or a route string assembled anywhere except `hrefFor`, is a
bug — the first cannot be translated and the second is how a nav and a router
drift apart.

`hrefFor` returns `null` for anything not navigable, so a planned destination
cannot be rendered as a link. The nav shows the information architecture
honestly; it never links to a route that does not exist.

Search is a provider registry. Adding a searchable domain means registering a
provider, never editing the palette. No provider may index content that does
not exist. A provider is isolated twice over — `allSettled` for one that
throws, a deadline for one that hangs — because a palette stuck on "Searching"
is a broken palette.

**Hover is a mouse capability, not a default.** Any handler that opens
something on `pointerenter` checks `pointerType`, and every such surface has a
press-based path that works without hovering at all. `pointerenter` and
`focusin` both fire before the `click` they precede, so opening on either one
turns a tap into open-then-close.

## 8b. Payload is route-scoped

A content dataset belongs to the route that renders it. Threading one through a
shared client component — a nav, a footer, a layout — serializes it into every
document on the site, including pages that render none of it. This is not
hypothetical: the EPIC 04 concept dictionary reached every route that way, 18.2
kB of a 24.8 kB placeholder page.

Search providers therefore receive a **loader**, never data. Nothing is fetched
until someone searches.

Renderer instances follow the same discipline: at most one active per page,
mounted on intersection, and at most one server-rendered full-fidelity chart
fallback per document. Cards get a glyph, not a chart.

## 8c. Private data never touches a public surface

Journal records are user-private. They are not server-rendered, not placed in
any static route, not registered with the global search index, and not threaded
through a shared client component. The application shell prerenders empty and
carries `noindex`; a single record is addressed by URL fragment, which never
reaches a server.

Financial values are integers — money in minor units, prices scaled, ratios in
basis points — with one division and one rounding at the end. A journal that
reports different totals depending on summation order is not evidence.

No derived figure is stored beside its inputs, and no metric is shown that the
sample does not support. `null` means insufficient data and must never render
as `0`.

## 8d. User input is parsed, never coerced

A value typed by a person is untrusted text until it has been parsed. The
parse is explicit, refuses rather than guesses, and reports every problem at
once. `Number("")` is `0` and `Number(" ")` is `0`; a form that leans on them
records a trade with a zero stop and no one finds out until a metric is wrong.

Errors carry stable codes, not English sentences, so every message is
translatable and a test can assert none is missing.

The application never asks for a value it can derive. No P&L field, no R
field, no win/loss selector — a figure the user could type is a figure that can
disagree with the record beside it.

Validation runs in one place and applies to every writer: the capture form, an
edit, a migration, and any future importer are held to the same definition of a
valid trade. Validation is also pointed at data read back from storage, so it
must survive genuinely malformed input rather than assuming its own types.

Nothing is destroyed without a confirmation that names the consequence, and
nothing that was written is silently reinterpreted by a later version.

## 9. Definition of done

A feature is not finished because it renders. It is finished when:

`npm run typecheck` clean · `npm run lint` clean · `npm test` clean ·
`npm run build` clean · public routes still prerendered · responsive at 390 and
1440 · both locales · both themes · keyboard reachable · contrast ≥ 4.5:1 for
text · fallback verified · no fabricated data · tokens used · documentation
updated.

§76.

## 9a. Pure logic is tested; pixels are verified

`npm test` — Node's built-in runner, no framework, no dependency.

Tests cover the pure layer only: progress resolution, stage continuity, reveal
monotonicity, the scene's own narrative invariants, and renderer selection.
That boundary is deliberate — these are the things that can silently become
wrong while still rendering perfectly.

**The scene tests are the point.** A chart with a sweep that no longer clears
the liquidity level, or a retracement that fills the gap it is supposed to stop
inside, still draws a convincing picture — it just teaches something false.
Both cases are covered and both fail loudly.

Anything visual is verified in a compositing browser instead (rule 10).

## 10. Verify in a browser that composites

An embedded preview pane that is not displayed does not run the rendering
lifecycle: `requestAnimationFrame` is paused and `ResizeObserver` callbacks do
not fire. A canvas measured there reports a collapsed size and never paints —
this looks exactly like a real bug and is not one.

Verify canvas and scroll work by driving headless Chrome over CDP with an
explicit `Emulation.setDeviceMetricsOverride`, and confirm the canvas backing
store matches its host box before trusting anything else on screen.
