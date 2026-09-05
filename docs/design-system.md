# Design System

Everything visual resolves through `app/globals.css`. This document explains
the layers; the file itself is the reference.

---

## Three layers

```
PRIMITIVES   --ink-050, --paper-100, --blue-500   raw values, each literal once
     ↓
SEMANTIC     --surface, --text-primary, --accent  roles, via light-dark()
     ↓
TAILWIND     @theme inline → bg-surface, text-primary, border-subtle
```

A component uses layer 3. It may reach layer 2 through `var()` for properties
Tailwind does not cover. It never touches layer 1, and it never writes a raw
value.

Layer 2 holds no raw literals either. Where a role needs a transparency it
derives one — `--scrim` is `color-mix()` over a primitive, not the primitive's
value restated with an alpha channel.

Layer 3 contains colours and fonts only. It deliberately does **not** alias
radius or easing: `--radius-sm: var(--radius-sm)` inside `@theme inline` emits
a self-referential custom property that resolves only by source-order accident,
and nothing used the generated utilities. Components reference the primitives
directly — `rounded-[var(--radius-lg)]`.

## Contrast is a token responsibility

`--accent-contrast` flips with the theme, because the two accents need
different foregrounds:

| Theme | Accent | Foreground | Ratio |
|---|---|---|---|
| Light | `#0060df` | white | 5.62:1 |
| Dark | `#0a84ff` | ink | 5.76:1 |

White on the dark theme's electric blue is **3.65:1** — below the 4.5:1 floor,
and button text at 13px does not qualify for the large-text exemption. Ink on
blue is also the more deliberate look. Any new pairing used for text is checked
before it ships.

## Theming

Both palettes are declared once, as `light-dark(light, dark)` on each semantic
token, resolved by `color-scheme`:

```css
:root                       { color-scheme: dark light; }  /* follows the OS */
:root[data-theme="dark"]    { color-scheme: dark; }        /* explicit choice */
:root[data-theme="light"]   { color-scheme: light; }
```

The toggle therefore changes exactly one property. There is no duplicated
mapping block to keep in sync, and native scrollbars and form controls follow
the theme for free.

A pre-paint inline script in `<head>` applies the stored choice before first
paint. Without it a visitor who chose light gets a black flash on every
navigation. `"system"` writes no attribute at all, which is what lets the
`dark light` declaration follow the OS.

**Canvas caveat.** Custom properties holding `light-dark()` do not resolve when
read via `getComputedStyle` — the function is only evaluated once the value
lands on a real property. The canvas renderer therefore reads its palette by
assigning each token to `color` on a throwaway probe element and reading back
the resolved `rgb()`. This is what makes the chart follow the theme toggle
instead of freezing on whichever theme loaded first.

## Colour

Dark is the brand default (§6). Light is a separate system (§7), not an
inversion — its greys are warmer and its surfaces are white on a tinted canvas.

Electric blue is *precision light*. It marks liquidity levels, the sweep, the
active stage, the primary CTA, and focus rings. It is not a background, not a
gradient, and not a section fill. If a screen has blue in more than three
places, one of them is wrong.

Long and short are deliberately desaturated. This is a research terminal, not a
casino (§5, §67).

## Typography

Four token families: `display`, `body`, `mono`, `persian`.

| Face | Role | Why |
|---|---|---|
| Inter | Latin display + body | Neutral, excellent at small sizes, huge weight range |
| Vazirmatn | Persian | Designed for Persian rather than adapted from Arabic; matches Inter's proportions closely enough to share a scale |
| JetBrains Mono | All numeric and terminal labels | §8 requires monospace for financial data |

Self-hosted at build time by `next/font`. No runtime request to Google, no
third-party connection on the critical path, no layout shift from a late swap.
Subsets are narrow — a Persian reader does not download Latin coverage.

The scale is fluid `clamp()` from `--text-micro` to `--text-display`. There are
no breakpoint-specific font-size overrides anywhere in the codebase, and adding
one is a bug.

Persian gets looser leading (`--leading-relaxed`) because Vazirmatn's
ascenders and diacritics need the room.

All numerics carry `.numeric`: monospace plus `tabular-nums`, so digits do not
jitter as values update.

## Direction

RTL is structural, not a stylesheet flip. Layout uses logical properties
throughout, so `dir="rtl"` on `<html>` reverses the grid, the nav, the button
order and the underline origin with no per-component branching.

Latin runs inside Persian copy use `.latin` (`unicode-bidi: isolate`), which
prevents a Latin technical term from reordering the paragraph around it — the
same UAX #9 problem solved elsewhere in this stack, handled here at the CSS
layer where the browser's bidi algorithm can do it properly.

## Motion

Personality: slow, precise, fluid, cinematic. Never bouncy.

```
--ease-out         cubic-bezier(0.22, 1, 0.36, 1)     entrances
--ease-precision   cubic-bezier(0.16, 1, 0.3, 1)      reveals, nav states
--dur-fast    240ms   --dur-base 420ms   --dur-slow 720ms   --dur-scene 1200ms
```

Under `prefers-reduced-motion`, transitions collapse to ~0 via the global media
query, Lenis never mounts, and the performance profile drops to `low`. Content
is never removed — only the motion around it.

## Navbar states

`INITIAL · SCROLLED · HIDDEN · MENU_OPEN`, written to `data-state` by the frame
loop. `MOBILE` is a viewport condition, so it is a media query rather than a
state.

`.site-header:focus-within` cancels the hidden transform: a navbar that hides
on scroll is a keyboard trap if tabbing into it cannot bring it back.

## Component primitives

`.btn` / `.btn-primary` / `.btn-ghost` / `.btn-icon`, `.nav-link`,
`.label-terminal`, `.container-page`, `.menu-item`, `.nav-pending`.

Recurring shapes live here so that changing the button radius is one edit, not
forty. A new arbitrary-value class string that duplicates one of these is a
bug.

`.nav-pending` marks a section whose page is still a placeholder. The route is
real and the shell renders; the dot is what stops a visitor clicking through
six identical pages to discover that.
