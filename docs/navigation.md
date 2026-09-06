# Global Navigation & Interaction Architecture

EPIC 02. Everything described here exists in the repository and was verified in
a browser; nothing below is planned work.

---

## The model

`lib/navigation.ts` holds one tree. It drives the desktop bar, the mega menus,
the mobile drawer, the footer, the command palette and route validation. There
is no second list.

```
NavNode   id · labelKey · segment · status · children?
NavChild  id · labelKey · segment? · status
```

Two rules make it safe to extend:

- **Labels are dictionary keys, never strings.** A label written in this file
  is a label that cannot be translated.
- **Routes are segments, never paths.** `hrefFor(locale, node, parent?)` is the
  only place a URL is assembled, and it returns `null` for anything not
  navigable — so the null branch is a type error to ignore, and the nav
  physically cannot link to a route that does not exist.

### Status, not a boolean

```
active       real content
placeholder  route resolves to the honest "in development" page
planned      no route; shown in the IA, never linked
```

Three states because they behave differently. A placeholder is navigable; a
planned destination must not be, or the navigation sends people to a 404. This
is why mega-menu children render as labelled text with a "coming soon" badge
rather than as links.

## State machine

`lib/nav-state.ts` is a pure reducer, unit-tested without a browser.

```
INITIAL ──scroll past 24px──> SCROLLED ──down >4px, past 240px──> HIDDEN
   ^                              ^                                 │
   └──── back above 24px ─────────┴────────── up >4px ──────────────┘

MENU_OPEN overrides everything while the drawer is open.
```

Thresholds exist for specific failures: sub-pixel jitter and rubber-band
scrolling both produce tiny deltas, and acting on them makes the bar flicker;
hiding near the top of a page reads as the navigation breaking rather than as
reclaiming space.

`MOBILE` is not in this machine. It is a viewport condition, expressed as a
media query, not a scroll state.

## Where state lives

| State | Owner | Why |
|---|---|---|
| Scroll → nav state | `data-state` attribute, written from the shared frame loop | Changes every frame. React renders: **zero**. |
| Menu / palette / mega open | React | Discrete user intentions. |

Open surfaces are stored **with the route they were opened on**:

```ts
const [palette, setPalette] = useState({ open: false, path: pathname });
const paletteOpen = palette.open && palette.path === pathname;
```

"Navigating closes it" is then a derived value rather than an effect calling
`setState` on every route change. Back/forward are covered, not just clicks,
and there is no cascading render on navigation.

## Scroll integration

There is still exactly **one** `requestAnimationFrame` chain in the
application — `lib/motion/frame-loop.ts`. The navbar subscribes to it. It does
not add a scroll listener, and no component added one for this Epic.

```
scroll position → nextNavState() → data-state → CSS transition
```

## Command palette

`components/navigation/CommandPalette.tsx`, code-split behind `next/dynamic`:
a page that is never searched never downloads it.

Semantics are the combobox pattern — a text input owning
`aria-activedescendant` over a `listbox`, inside a modal dialog. Arrow keys
move the active option without moving DOM focus, which is what lets someone
keep typing while navigating results.

### Search provider abstraction

```
SearchProvider  { id, search(query, context) → SearchResult[] | Promise<…> }
```

`searchAll` fans out to every registered provider and merges by score. Two
different failures are isolated, because they are different failures:

- a provider that **throws or rejects** is contained by `allSettled` — the
  palette shows fewer results, never none;
- a provider that **hangs** is contained by a 2s deadline. `allSettled` alone
  waits forever for it, which would leave the palette stuck on "Searching" —
  and hanging is the likely failure for a network source on a bad connection,
  not throwing.

Both are asserted in tests, along with the merge across four stand-in
providers for the Phase 2/3 domains and a JSON round-trip proving results are
plain data a server can return over the wire.

**No backend search exists and none was built.** The only provider that ships
indexes what genuinely exists: the navigation destinations and the palette's
own commands. Academy lessons, setups, dictionary terms and journal entries
each get a provider when that content exists. Adding one is registration, not a
change to the palette.

Planned destinations are indexed but carry no `href`, so searching "replay"
tells you it is coming rather than returning nothing — and cannot navigate to a
404.

Persian queries are normalised: Arabic yeh and kaf fold onto their Persian
forms and diacritics are stripped, so someone typing on an Arabic keyboard
still matches Persian copy.

## Opening a mega panel

Three input methods, one open state, and the interaction is defined by which
input is actually in use:

| Input | Opens | Closes |
|---|---|---|
| Mouse | `pointerenter`, 120ms grace on leave | leaving the item, Escape, a press outside |
| Touch / pen | tapping the trigger | tapping the trigger again, a tap outside, navigating |
| Keyboard | Enter, Space or ArrowDown on the trigger | Escape, or tabbing out of the item |

Two of those rules are there because of specific failures found in a browser,
not because of taste:

**Hover is mouse-only.** `pointerenter` fires with `pointerType: "touch"` at
touch-start, immediately *before* the click it precedes. Opening on it meant a
tap opened the panel and the click that followed toggled it straight back
shut — on a touch screen the mega menu could not be opened at all. The desktop
bar shows from 1024px, so this covers tablets in landscape, not an exotic case.

**There is no focus-to-open.** `focusin` also fires before `click`, so it
reproduced exactly the same open-then-close on tap. Removing it costs nothing:
Enter, Space and ArrowDown all open the panel, which is the disclosure pattern
regardless — and auto-opening on Tab had been forcing every keyboard user
through eight extra tab stops per section just to pass the bar.

**Escape restores focus.** The panel unmounts when it closes, so it cannot be
the thing that decides where focus goes; the trigger owns that. Focus is only
restored when it was genuinely inside the item — a panel opened by hovering
must not pull focus away from wherever the user actually is.

The 120ms grace exists because the panel hangs 12px below the item with a dead
zone between them. A mouse crosses that in well under 120ms; the timer is
cancelled the moment the pointer enters the panel, which is a descendant of the
same item.

## Shared overlay behaviour

`lib/interaction/use-dismissable-layer.ts` is used by both the drawer and the
palette: focus in, focus trapped, Escape closes, focus restored, page scroll
locked with scrollbar-width compensation so locking does not shift the layout
sideways.

It exists once because a second hand-written focus trap is how one of the two
ends up subtly wrong — usually the one nobody tests with a keyboard. The
tabbable set is re-queried on every Tab rather than captured once, because the
palette's contents change as results come and go.

## Direction

Logical properties throughout. The mega panel is positioned with
`inset-inline-start`, so it hangs from the item's start edge in both
directions with no mirrored rule. Panels near the end of the bar anchor from
`inset-inline-end` instead, which keeps them on screen in RTL and LTR alike.

`horizontalStep()` maps arrow keys through the locale's direction:
ArrowRight advances in LTR and *retreats* in RTL. Hardcoding right-means-next
is the standard way a keyboard menu becomes unusable in Persian.

There are no duplicate Persian components.

## Mobile

Structurally different, not a narrowed desktop bar:

- sections expand in place as accordions, rather than opening a hover panel
- `100dvh`, so the panel tracks iOS Safari's collapsing toolbar instead of
  being cropped by it
- `env(safe-area-inset-*)` on all four sides
- every target ≥ 44px, verified at 390px in both locales
- the section matching the current route starts expanded
- below 480px the wordmark contracts to its short form and the locale/theme
  toggles move into the drawer — four 44px controls plus the full wordmark do
  not fit a 390px bar, and the drawer is one tap away

## Accessibility

The mega menu is a **disclosure, not an ARIA `menu`**. The APG reserves
`role="menu"` for application-style command menus with roving focus; this is a
list of navigation links, and announcing it as a menu promises keyboard
behaviour that links do not have. A button with `aria-expanded` over a plain
`<ul>` of links is the correct pattern and the one that works with Tab.

Verified: semantic `<nav>` with landmark labels, `aria-expanded`/`aria-controls`
wired to real panel ids, `aria-current="page"` on exactly one item per route,
dialog semantics on both overlays, Escape everywhere, focus trap and
restoration, skip-link compatibility, and reduced motion disabling smooth
scroll while leaving all navigation present.

## Analytics

`lib/analytics.ts` — one `track` call and a closed event vocabulary. No
provider is integrated. With no sink registered it is a no-op in production and
a console line in development: deliberately not a queue that grows, and never a
network request.

Payloads carry identifiers and counts only. A search query is reported as a
**length**, never as text.

## Page transitions

Not built. The architecture that makes them addable later is in place: every
open surface already closes on route change through derived state, motion
categories exist as tokens, and navigation is never blocked waiting on an
animation. Building a transition means adding one wrapper, not unpicking state.

## What was deliberately not built

Setup Lab, Academy, Dictionary and Journal content; authentication; dashboards;
backend search; a custom JS cursor. The cursor **vocabulary** exists in CSS
from EPIC 01; a future custom cursor binds to those states rather than
inventing its own.
