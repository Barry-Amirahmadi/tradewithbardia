# TradeWithBardia

Systematic trading research and education. Bilingual (Persian / English),
dark-first, scroll-driven.

**Status: Phase 0 — architecture, design system, and the first vertical slice.**

---

## Run it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. `/` redirects to a locale — `/fa` or `/en`
— based on `Accept-Language`.

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # production build
```

## What is here

A complete vertical slice, per §80: global shell → navigation → theme →
language → hero → trading visualization engine → responsive → performance
fallback.

- **Token-driven design system.** Primitives → semantic → Tailwind, with dark
  and light as separate systems resolved through `light-dark()`.
- **True bilingual RTL/LTR.** Direction is structural, via CSS logical
  properties. No component branches on direction.
- **Scroll-driven hero.** One continuous scene walking a single setup: market,
  noise, structure, liquidity, sweep, market structure shift, fair value gap,
  entry with a defined stop and target, then the chart resolving into the
  system. Nine beats, scroll as the timeline.
- **Trading visualization engine.** One scene format, a renderer chain, a
  server-rendered static fallback and a client canvas upgrade that resolve
  through the same pure state function.
- **Real routes for the whole IA.** Six sections, both locales, honest
  placeholder content, correct metadata, branded 404.

## What is not here, on purpose

The Setup Lab, the Journal SaaS, WebGL, the command palette and Dictionary
tooltips are all deliberately out of Phase 0. The reasons are recorded in
[`docs/architecture.md`](docs/architecture.md#what-phase-0-deliberately-excludes)
— the Setup Lab one matters most and is not a scheduling decision.

## The rule that outranks the others

**No fabricated trading data.** Every scene declares its provenance and nothing
in this repository is `verified`. The hero chart is synthetic and says so on
screen, in both languages, directly under the diagram.

See [`PROJECT_RULES.md`](PROJECT_RULES.md) — read it before adding a feature.

## Documentation

| File | Contents |
|---|---|
| [`PROJECT_RULES.md`](PROJECT_RULES.md) | Architectural and design rules. Source of truth. |
| [`docs/architecture.md`](docs/architecture.md) | Phase model, directory map, the visualization engine, known gaps. |
| [`docs/design-system.md`](docs/design-system.md) | Tokens, theming, typography, direction, motion. |

Three documents, not seventeen. The rest are written when the code they
describe exists.

## Stack

Next.js 16 · React 19 · TypeScript 6 · Tailwind 4 · Lenis

TypeScript is pinned to 6.x and ESLint to 9.x because the Next lint chain does
not yet support 7.x and 10.x respectively. See PROJECT_RULES §8 before bumping
either.
