# Design System

Everything visual resolves through `app/globals.css`. This document explains
the layers; the file itself is the reference. Nothing below is aspirational —
if it is described here, it exists in the stylesheet and was verified in a
browser.

---

## Three layers

```
PRIMITIVES   --ink-050, --paper-100, --blue-500, --green-600   raw values, each literal once
     ↓
SEMANTIC     --surface, --text-primary, --accent, --market-*   roles, via light-dark()
     ↓
TAILWIND     @theme inline → bg-surface, text-primary, text-danger, border-subtle
```

A component uses layer 3, or layer 2 through `var()` for properties Tailwind
does not cover. It never touches layer 1, and it never writes a raw value.

Layer 2 holds no raw literals either. Where a role needs transparency it
derives one — `--scrim` and the `--status-*-surface` tints are `color-mix()`
over a primitive, not the primitive's value restated with an alpha channel.

Layer 3 carries colours and fonts only. It deliberately does **not** alias
radius or easing: `--radius-sm: var(--radius-sm)` inside `@theme inline` emits
a self-referential custom property that resolves only by source-order accident.
Components reference the primitives directly — `rounded-[var(--radius-lg)]`.

### Namespace hazard

Tailwind v4 owns several custom-property prefixes, `--font-*` and `--text-*`
among them. Properties declared under those names are treated as theme keys.
The type scale is therefore `--size-*`, not `--text-*` — which also
disambiguates it from the `--text-primary` / `--text-secondary` **colour**
tokens that share the old prefix. Font stacks are written where they are used
rather than through an intermediate token.

## Colour

Dark is the primary institutional register; light is a separate system, not an
inversion — its greys are warmer and its surfaces are white on a tinted canvas.

Both palettes are declared once, as `light-dark(light, dark)` on each semantic
token, resolved by `color-scheme`:

```css
:root                       { color-scheme: dark light; }  /* follows the OS */
:root[data-theme="dark"]    { color-scheme: dark; }        /* explicit choice */
:root[data-theme="light"]   { color-scheme: light; }
```

The toggle changes exactly one property. There is no duplicated mapping block,
and native scrollbars and form controls follow the theme for free. A pre-paint
inline script in `<head>` applies the stored choice before first paint;
`"system"` writes no attribute at all.

### Status

Four roles, no more. `info` reuses the accent rather than introducing a fifth
hue. Each draws from the same green/red/amber families as the market marks, so
a rising candle and a success message look related.

Each hue carries a `-500` tuned for light grounds and a `-400` for dark,
because one value cannot clear 4.5:1 against both.

### Contrast is a token responsibility

`--accent-contrast` flips with the theme, because the two accents need
different foregrounds:

| Theme | Accent | Foreground | Ratio |
|---|---|---|---|
| Light | `#0060df` | white | 5.62:1 |
| Dark | `#0a84ff` | ink | 5.76:1 |

White on the dark theme's electric blue is 3.65:1 — below the floor, and 13px
button text does not qualify for the large-text exemption. Hover moves *away*
from the page's lightness in both directions for the same reason.

`--text-muted` still clears 4.5:1. Near-white and near-black grounds leave
little room between "secondary" and "muted" while holding that floor, so the
gap is deliberately small — pair it with size or weight, not more colour.

`--text-disabled` sits below 4.5:1 on purpose: WCAG 1.4.3 exempts inactive
controls, and a disabled control that still looks active is the worse failure.
Disabled state is always signalled by `disabled`/`aria-disabled` and the
not-allowed cursor as well, never by colour alone.

`--focus-ring` is its own role rather than an alias of the accent, so the brand
colour can change without silently altering the one affordance that must never
degrade.

## Typography

Seven roles. A component picks the role it is playing; it never restates a
size, weight, leading and tracking in markup.

| Role | Use |
|---|---|
| `.type-display` | Reserved for full-bleed brand moments |
| `.type-h1` `.type-h2` `.type-h3` | Section hierarchy |
| `.type-lead` | Standfirst — the paragraph carrying a section |
| `.type-body` | Running copy |
| `.type-caption` | Secondary copy, disclosures, small print |
| `.type-label` | Terminal eyebrow: mono, tracked out, uppercase |
| `.type-data` / `.numeric` | Every financial figure |

Sizes are fluid `clamp()` — one scale, no breakpoint-specific font-size
overrides anywhere. Four weights, not nine.

Heading roles set **no** `font-family`. They inherit, which is what lets
Persian headings stay on Vazirmatn without a per-role override; declaring the
Latin face on them is exactly what broke it during this Epic.

### Financial typography

`.type-data` is monospace with `tabular-nums slashed-zero`: digits hold their
column as values update, and a zero is never read as an O in a fill report.
Inside Persian copy numbers stay LTR and Latin — a price is a quantity, not
prose.

The chart uses the same mono face, read from `--chart-axis-size` and
`--chart-tag-size` rather than hardcoded. Those sit a step below the UI scale
on purpose: axis figures are reference marks and at UI sizes they compete with
the price action they label.

### Persian

Persian is first-class, not a translation layer:

- its own face (Vazirmatn) and looser leading
- `.type-label` drops uppercase and wide tracking — uppercase is a Latin
  device, and wide tracking breaks joined script so letters stop connecting
- numerals stay LTR and monospaced
- a **1.04 optical size multiplier**, because Vazirmatn's x-height runs smaller
  than Inter's at the same computed size

The multiplier lives in `--fa-scale` alone and the roles multiply the shared
scale, so there is one type system rather than two. **No duplicate Persian
components exist**; direction is structural.

## Spacing, layout, density

One spacing scale. Four container widths cover both registers the product must
serve — cinematic marketing and dense financial application — sharing one scale
so a dashboard beside a marketing section still feels like one product:

`--container-max` (marketing) · `--container-wide` (visualisations, tables) ·
`--container-text` (reading measure) · `--container-narrow` (forms, dialogs)

Breakpoints are named for available space, not devices: `--bp-compact`,
`--bp-standard`, `--bp-wide`. A component asks how much room it has, never
whether it is "on a phone". Row heights (`--row-compact` … `--row-comfortable`)
exist for dense surfaces; marketing does not use them.

## Surfaces, borders, radius

Four tiers plus glass: `.surface`, `.surface-raised`, `.surface-overlay`,
`.surface-glass`. Elevation is carried by **border and background, not
shadow** — shadow reads as physical material, the wrong register for an
instrument. Shadow is reserved for things that genuinely float.

Glass always declares a solid colour first and adds `backdrop-filter` inside
`@supports`, so the product still looks deliberate when blur is unavailable or
disabled. One blur recipe (`--glass-blur`) for every glass surface.

Radius: four steps (`sm` `md` `lg` `pill`). No ad-hoc values.

## Components

| Class | States |
|---|---|
| `.btn` + `-primary` `-secondary` `-ghost` `-destructive` `-icon` | default, hover, active, focus, disabled, `data-loading` |
| `.link-inline` `.link-text` `.link-external` `.nav-link` | hover, focus, current |
| `.input` `.input-numeric` `.field-label` `.field-error` `.field-hint` | default, hover, focus, filled, invalid, disabled |
| `.card` `.card-interactive` `.card-data` | hover, focus-within |

Disabled is defined once on `.btn`, so no variant can forget it.
`pointer-events: none` is deliberately not used — it would suppress the
not-allowed cursor and stop the control being hoverable for an explanation.

Destructive is outlined by default and fills only on hover: deleting a trade
record should take one more moment of intent than confirming one.

Below `--bp-compact` every icon control meets the 44px target.

### Governance

A component exists because a repeated visual **or behavioural** pattern exists.
`SetupCard` and `LessonCard` are not different components — they are `.card`
with different content, and they stay that way until their behaviour diverges.
No form components ship in this Epic; the foundation does, so search, filters,
trade entry, login and quizzes inherit one set of states.

## Trading visualization language

Every chart concept has a named token: `--market-bullish` `--market-bearish`
`--market-liquidity` `--market-sweep` `--market-structure` `--market-imbalance`
`--market-entry` `--market-stop` `--market-target` `--market-grid`
`--market-axis` `--market-neutral`.

Before these existed the canvas drew liquidity **and** the sweep with
`--accent`, the structure break with `--text-primary`, and the fair value gap
with the bearish candle colour — three ideas borrowing three unrelated generic
tokens. A second chart would have invented its own mapping.

Both renderers — canvas and the server-rendered SVG fallback — consume this
same vocabulary, so they cannot drift.

Entry is deliberately neutral rather than green: it is a decision, not an
outcome, and colouring it green would imply a result the chart is not claiming.

These are **marks, not text**: the threshold is 3:1 (WCAG 1.4.11), not 4.5:1.
Gridlines are decorative scaffolding and exempt. Labels drawn beside marks use
the text tokens and are held to 4.5:1.

## Motion

The design system names the job; the motion engine performs it.

| Category | Use |
|---|---|
| `--motion-instant` | State flips |
| `--motion-micro` | Hover, focus |
| `--motion-interaction` | Menus, panels |
| `--motion-transition` | Route and section changes |
| `--motion-cinematic` | Hero beats |

Each pairs a duration with its easing, because those are one decision. Travel
is bounded (`--move-xs` … `--move-lg`) and scale barely moves
(`--scale-from: 0.98`) — institutional, not playful.

## Direction

Logical properties throughout: `margin-inline`, `inset-inline`, `padding-block`,
`text-align: start`. A physical `left`/`right` in a layout rule is a bug.
RTL emerges from `dir` on the locale wrapper; there is no mirrored stylesheet
and no duplicate component.

The one deliberate exception is the chart's price axis, which stays on the
right in both directions — charts are not prose, and every trading terminal a
Persian-reading trader already uses puts it there.

## Cursor

Semantic states in CSS: `.cursor-chart` (crosshair), `.cursor-dictionary`
(help), `.cursor-media`, `.cursor-disabled`, plus the button/link defaults.
No custom JS cursor — that is a motion feature, not a design-system one. What
exists here is the state vocabulary a future custom cursor would bind to.

## Icons

Sized from `--icon-sm` / `--icon-md` / `--icon-lg` with a constant
`--icon-stroke`, so they read as one family. No icon library is installed;
none is justified yet.

## Verification

Checked in a compositing browser at 390 / 768 / 1024 / 1440 × Persian and
English × dark and light: no overflow, canvas matches its host, correct
direction, CTA and body contrast above 4.5:1 at every combination, all button
variants and states distinct, and the trading tokens resolving to distinct
values above 3:1 in both themes.
