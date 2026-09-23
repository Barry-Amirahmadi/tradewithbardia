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
  sections/            Hero (server) → HeroScene (client), Footer
    TradingSystem/     TradingSystemStory (server) → SystemScroller, SystemLoop
  trading/             ConceptNode — the Dictionary integration contract
  motion/              SmoothScroll
  charts/              TradingAnimation (façade), SceneDisclosure
lib/
  i18n/                Locale config, dictionaries, direction
  motion/              frame-loop, useScrollProgress
  viz/                 Renderer abstraction, canvas + static renderers, scenes
                       market-tokens (the shared chart vocabulary)
                       render-profile (what each performance mode may draw)
  trading/             concepts (the canonical model), system-stages
  search/              provider registry, navigation + concept providers
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

## The hero

EPIC 03. Nine beats — MARKET, NOISE, STRUCTURE, LIQUIDITY, SWEEP, MSS, FVG,
EXECUTION, SYSTEM — carrying one idea: the market looks like noise until you
know what to look for.

```
scroll position → normalized progress → SceneState → renderer
                                     └→ HeroBeat  → copy, rail, analytics
```

**Everything is derived from one number.** The scene keeps no history, which is
what makes scrolling backwards, jumping in with a link, restoring a position on
reload and resizing all the same thing to it. `normalizeProgress` is the only
door in: it clamps out-of-range values in the direction they overshoot, and
resolves `NaN` to the start. That last case is not defensive decoration — NaN
survives every comparison in a naive clamp, and a canvas asked to draw at NaN
paints nothing at all, which looks exactly like a renderer that failed to
mount.

Beat identity (`HeroBeat`) and continuous state (`SceneState`) are separate on
purpose. Beats are semantic — they name where the viewer is for the copy, the
rail and analytics — while everything visible interpolates. Progress 0.32 is a
real intermediate picture, not the nearest of nine slides.

The nine beats are declared twice, once as a typed union and once as the stage
table that carries their timing, and `hero-scene.ts` asserts at load that the
two agree. `HeroScene` then indexes the dictionary with a `HeroBeat`, so adding
a tenth beat without copy for it in both languages is a type error rather than
a caption that renders `undefined`.

### Two modes, chosen by preference rather than by device

| | Cinematic | Static |
|---|---|---|
| Chosen when | default | `prefers-reduced-motion: reduce` |
| Section | 240vh mobile / 320vh desktop, pinned | its own content height |
| Renderer | canvas | static SVG at the resolved end state |
| Copy | three layers cross-fading | opening statement, then the closing one |
| CTA | present | present |

Reduced motion is answered in `capability.ts` *before* the renderer chain is
consulted, because it is a stated preference and not a capability guess. It
previously folded into the `low` profile, which still permitted canvas — so
someone who asked their operating system for less motion received a
scroll-scrubbed animation anyway. The static tier is not a degraded hero here:
it is the SYSTEM composition the sequence was building toward.

The section height is switched in CSS rather than from the capability store, so
there is no tall-then-short reflow after hydration.

The preference is **live**: someone who turns motion down mid-session because a
page is making them ill should not have to reload to be believed. That makes
the switch a real transition rather than a load-time branch, and it has one
non-obvious consequence. The frame loop writes `opacity`, `transform` and
`visibility` directly onto the three copy layers, and an inline style outranks
any stylesheet rule regardless of specificity — so leaving cinematic mode
mid-sequence would strand whichever frame was showing, typically an invisible
opening statement, since at most one layer is lit at any position. `HeroScene`
therefore removes exactly the properties it set when `cinematic` goes false.
This is written out rather than left to React, which never knew about those
writes: browser QA showed the styles being cleared anyway, but a behaviour
nothing in our own code accounts for is not a guarantee.

### Performance modes

`capability.ts` decides *which renderer*; `render-profile.ts` decides *how much
it may draw*. Until EPIC 03 only the first existed, so the profile was computed
and then changed nothing — a four-year-old phone resolved to canvas and drew
exactly what a desktop drew.

A `RenderBudget` is data: DPR ceiling, gridline count, ambient point count,
camera easing, whether tags and wicks are drawn. HIGH, MEDIUM and LOW differ in
all of them, and density (a narrow box) is applied as a separate axis from
capability (a slow device) — a fast phone should get the full treatment at a
lower density, and a slow desktop a sparse one at full size.

The rule the numbers follow: **LOW keeps the story and gives up the
atmosphere.** Candles, structure, annotations, labels, text and CTA all
survive; the ambient layer and the pixel ratio do not.

### The atmospheric layer

One effect, and it is the argument rather than decoration: a field of
unresolved ticks behind the plot that thins out across MARKET and NOISE and is
gone by the time liquidity is named. The noise does not fade because a fade
looks good, it fades because the viewer has learned to read it. Positions come
from a fixed seed into a flat typed array, so nothing is allocated per frame
and the field is identical on every device and every reload.

### Handing off to real data

Nothing here needs to change when illustrative data becomes real. The scene is
a `TradingScene`; a `RealChartAnimation`, `FrameSequenceAnimation` or
`VideoSequenceAnimation` registers in `TradingAnimation.tsx` and the hero never
learns about it. Provenance travels with the scene, so a real sample stops
carrying the synthetic disclosure by changing one field rather than by someone
remembering to delete a paragraph. A future atmospheric video layer sits behind
the plot as an additional layer; the narrative works without it, which is the
condition for adding it at all.

## The trading system story

EPIC 04. Nine stages closing back onto the first, carrying one claim: a setup
is not the system, it is one stage inside a process whose output is its own
input.

### The canonical concept model

The architectural centre of this epic, and the reason it was not simply a new
section. The trading vocabulary existed in **three partial copies** that agreed
with none of the others:

| Copy | Where | Ids |
|---|---|---|
| Hero beats | `hero-scene.ts` | market, noise, structure, liquidity, sweep, mss, fvg, entry, system |
| Process steps | `Process.tsx` + `dictionary.process` | context, liquidity, structure, setup, execution, review, data |
| Nav children | `navigation.ts` | tradingSystem, marketContext, liquidity, structure, execution, risk, review |

"Liquidity" was a beat id, a dictionary key and a nav label key — three
strings, no relationship, and nothing preventing a fourth when the Dictionary
arrived.

`lib/trading/concepts.ts` is now the single identity for all of it. Nineteen
concepts: the nine stages, plus the mechanisms they introduce. It carries
identity and relationships and **no prose** — every human-readable word is a
dictionary key, because a concept model that holds English cannot be
translated.

```
TradingConceptId  →  parent · related · prerequisites · surfaces
```

Two derived relations are deliberately **not stored**: `childrenOf` inverts
`parent` and `usedBy` inverts `prerequisites`. A stored inverse is a second
copy that drifts the first time somebody edits one side.

Integrity is enforced at module load, not only by tests: a dangling reference,
a self-reference or a prerequisite cycle throws during the build. The test
suite asserts the same properties so the failure is legible either way.

### Stages are concepts

`system-stages.ts` declares no parallel id union. `SystemStageId` is a subset of
`TradingConceptId`, so the Setup Lab tagging a setup `"liquidity"` and this
section highlighting stage `"liquidity"` are the same string, checked by the
compiler. A test fails if a stage id stops being a concept.

Progress resolution reuses `normalizeProgress` from the visualization engine
rather than reimplementing clamping — which is why NaN, overshoot and reverse
scrolling behave identically here and in the hero.

`Process.tsx` and the `process` dictionary section were **deleted**, not left
alongside. Leaving them would have preserved exactly the duplication this epic
exists to remove.

### Rendering

DOM and SVG, not canvas. The figure is nine labelled points on a ring; a canvas
would cost a renderer, a fallback and a measurement lifecycle to draw what
vector graphics draw natively, and would put the stage names beyond reach of a
screen reader. The visualization façade is untouched and unextended — it owns
charts, and this is a flow diagram.

Colour comes from accent and border tokens, never the market vocabulary.
`--market-liquidity` means liquidity *on a price chart*; borrowing it for a
process diagram would say something untrue.

The section is a **server component**. Every stage's question and body is real
HTML: crawlable, translatable, and readable with JavaScript off. The client
shell adds the loop diagram and the active-stage highlight on top of content
that already works.

### Scroll and render cost

One `useScrollProgress` subscription to the existing frame loop. No second
scroll engine, no scroll listener, no second RAF chain. React renders are
bounded by stage count, not frame rate: the active stage changes at most eight
times across the whole section.

Under reduced motion the section is not scroll-driven at all — every stage
reads as reached, the loop shows closed, and nothing is sampled.

### Integration points

- **Setup Lab (EPIC 05)** — `conceptsForSurface("setupLab")` already names the
  concepts a setup will be tagged with. The section's CTA hands off to it.
- **Academy (EPIC 06)** — `prerequisites` is an acyclic graph, so a learning
  path is a topological sort over concepts that already exist.
- **Dictionary (EPIC 07)** — `concepts.<id>.term` / `.definition` are written
  for all nineteen in both locales. `ConceptNode` is the integration contract:
  it renders `data-concept="<id>"` in the DOM, so every occurrence is findable
  without parsing display text, which differs by locale.
- **Journal (EPIC 08)** — `conceptsForSurface("journal")` names what a trade
  record will be tagged with; review and data are already concepts.
- **Search** — `lib/search/concept-provider.ts` registers into the EPIC 02
  registry. A whole content domain became searchable by adding one file, with
  no change to the command palette. Results carry canonical ids, so the
  Dictionary will later return richer results for the same ids rather than a
  parallel set.

## The setup laboratory

EPIC 05. A library of written hypotheses, and the first surface to consume the
EPIC 04 concept model rather than extend it.

### The setup model

`lib/trading/setups.ts`. A setup references canonical `TradingConceptId`
values and never defines its own — a reference to a concept that does not exist
throws at module load, and a test asserts the same property.

Three things the model does deliberately:

- **Evidence is required, with no default.** Every setup declares
  `conceptual`, `demo`, `insufficient` or `verified`. Nothing can render
  without stating what is known about it.
- **There is nowhere to put a performance number.** No win rate, expectancy or
  drawdown field exists, so a component cannot display one by accident. A test
  asserts the model never grows one.
- **Copy lives in the dictionary**, keyed by setup id, so a setup is one object
  in every language.

Filter dimensions are derived by `filterDimensions()`, which reads the data and
drops any dimension with fewer than two values. No component hardcodes an
instrument, session or timeframe, so adding a setup that trades a new session
makes the filter appear on its own.

### Rendering: one instance, and only in view

The library page mounts **no renderer at all**. Each card carries a ~340 byte
polyline glyph generated from the setup's own shape descriptor — enough to tell
one setup from another, and explicitly not a chart. Server-rendering the hero's
23.4 kB SVG fallback per card would have put roughly 470 kB of markup into a
twenty-setup document.

Full fidelity is the detail page's replay: one renderer, mounted on
intersection, suspended when the figure leaves the viewport or the tab is
hidden. Both conditions are reconciled in one place so returning to a tab does
not resume a renderer that is scrolled away.

### Replay

`lib/trading/replay.ts` is pure and deterministic, resolving nine stages from
one normalized number through the same `normalizeProgress` the hero uses — so
NaN, overshoot and reverse behave identically across the product.

Playback subscribes to the shared frame loop **only while playing**, so a
paused replay costs nothing. There is no second RAF loop, no scroll engine and
no scroll listener: the replay is time- and scrub-driven, which is what lets it
sit on a page that already has a scroll-driven hero. Unlike the system loop it
clamps rather than wraps — a replay ends, and wrapping would imply the position
was re-entered.

Under reduced motion autoplay is disabled and the stage buttons and scrubber
remain, so the reader still reaches every stage. Reduced motion removes the
automation, not the content.

### Search provider loading

Providers now take a loader, not data (`lib/search/lazy.ts`). The index is
fetched on first search, cached for the session, and a failed load clears the
cache so a later keystroke retries. This is what makes a fourth and fifth
content domain free: `ConceptProvider`, `SetupProvider` and everything after
them scale without serializing any domain into any route.

## The free academy

EPIC 06. Eight lessons in one ordered path, and the third consumer of the
EPIC 04 concept model.

### Lessons reference concepts, never redefine them

`lib/trading/lessons.ts`. A lesson holds canonical `TradingConceptId` values
and no definitions of its own — the Academy is the fourth surface that could
have started a rival vocabulary and did not. A dangling concept id throws at
module load.

Two edges are **derived rather than authored**, because a hand-written copy of
either would drift:

- **Related setups** come from `setupsForConcept()`. A lesson lists no setup
  ids; it asks which setups use the concepts it teaches. Adding a setup that
  uses `liquidity` makes it appear in the liquidity lesson with no edit.
- **Curriculum validity** is checked against the concept graph. A lesson
  declares which lessons precede it, and a load-time assertion verifies that
  ordering is compatible with the canonical concept prerequisites: if a concept
  requires another, the lesson teaching it may not come before the lesson
  teaching the requirement. The two graphs cannot disagree about what has to be
  understood first.

Both are asserted in tests as well as at load, so the failure is legible from
either direction.

### Teaching visually without a second chart engine

The Academy adds no renderer, no scene data and no canvas. A lesson renders the
existing `heroScene` through the existing **server** static renderer at the
beat where its concept appears — `visualProgress` on the lesson record. The
liquidity lesson shows the sweep forming; the risk lesson shows entry, stop and
target together.

The consequences are all budget wins: zero canvas instances across the whole
Academy, zero renderer lifecycles, zero client JavaScript for the figure, and
one server-rendered chart per document. A lesson page is 15.5 kB of SVG rather
than the hero's 23.4 kB, because fewer candles are revealed at a mid-scene
progress.

The semantic explanation stays in HTML. The figure is an aid; the lesson is
readable, crawlable and translatable without it.

### Progress is local, and says so

`lib/academy/progress.ts` is `localStorage` behind an external-store interface.
There is no account and no network call, and the UI states that in words rather
than implying a synced profile. The wording is "read", never "completed" or
"mastered", and there is no certificate, badge or score — there is no
assessment behind them.

The store shape is what makes the future cheap: when accounts exist,
`subscribe`/`snapshot` are backed by a server and no lesson component changes.

### Search

A fourth provider, registered exactly like the third and loaded exactly like
the third. Lessons are the largest prose in the product and none of it is
serialized into any route. A lesson is findable by the **concept** it teaches,
not only by its title — searching "sweep" returns the liquidity lesson because
both name the same canonical id.

### Routing

`/[locale]/academy` and `/[locale]/academy/[slug]`, both static. The `learn`
navigation node now points at the `academy` segment and is `active`; its id
stays `learn` because that is the dictionary label key, not the route. The
generic `[section]` route excludes every segment that owns a dedicated route,
so one URL never has two builders.

## The trading dictionary

EPIC 07. The Dictionary is a **surface over `TradingConcept`**, not a registry
of its own — the fourth consumer of the EPIC 04 model and the one that makes it
user-facing.

### Identity, content and presentation are three things

| Layer | Where it lives |
|---|---|
| Identity | `TradingConceptId` in `concepts.ts` |
| Content | `concepts.<id>.{term, definition, full}` in each locale file |
| Entry metadata | `dictionary.ts` — category, aliases, status |
| Presentation | the route and its components |

`DictionaryEntry` has **no `id` field and no `slug` field**. It is addressed by
`conceptId`, and a test asserts that neither key ever appears — the moment an
entry acquires its own primary key, there are two identities for one idea.

The slug is *derived* (`slugForConcept`), so the URL is a presentation concern
that can change without touching identity: `equalHighs` → `/dictionary/equal-highs`.
One canonical slug per concept means one canonical route per localized concept.

### Every relationship is derived

The term page shows prerequisites, children, related concepts, the Academy
lesson, the setups and the Trading System stage. **None of it is authored
there.** `conceptContext()` reads the canonical graph and the existing reverse
edges (`lessonForConcept`, `setupsForConcept`); a test asserts no entry stores
`related`, `prerequisites`, `parent`, `lessons` or `setups`.

Empty relationships render nothing. A concept with no lesson gets no lesson
block rather than a placeholder.

### One definition, four surfaces

`concepts.<id>.definition` was already the canonical short definition before
this epic — the concept chip, the search result and the Trading System all
showed it. EPIC 07 added `full` beside it and gave it a page. There is still
exactly one definition per concept; the Dictionary is where it is *published*,
not a second copy.

`data-concept="<id>"` now appears on every surface that references a concept —
including the Trading System stages, which carried `data-stage` but not their
concept id until browser QA caught it. A future Dictionary crawler, analytics
sink or AI layer can find every occurrence without parsing display text.

### The contextual concept card

`ConceptNode` gained hover on pointer devices and a link into the Dictionary.
It is a **local disclosure, not a modal**: deliberately not built on
`useDismissableLayer`, because that hook traps focus and locks scrolling —
correct for the command palette, wrong for an inline definition the reader
scrolls past.

Hover is an enhancement only. `pointerType !== "mouse"` returns early, so touch
gets tap-to-toggle and keyboard gets Enter; nothing is reachable by hovering
alone. The card is intentionally brief — title, short definition, and a way to
the full entry.

### Search

The fifth provider, registered and loaded exactly like the fourth. §34 asked
for an audit of the provider architecture; the answer is that it is sufficient
and was left alone.

The index is **metadata only**: term, abbreviation, aliases and the canonical
id. Full definitions are deliberately not searched — matching definition prose
would return a concept for any word in any paragraph, and would mean shipping
every definition into the index. A test asserts a phrase unique to a full
definition returns nothing.

## JournalwithBardia

EPIC 08. The trading intelligence layer, and the fifth consumer of the EPIC 04
concept model.

### The public/private boundary

**The decision this epic turned on.** The site is statically exported with
`dynamicParams = false`. Server-authenticated `/app/*` routes would need a
backend and real authentication, both out of scope — so the application is
**client-only**, and three properties follow:

| | |
|---|---|
| `/[locale]/journal` | Public, static, indexable. The product argument and a demo. |
| `/[locale]/app/[[...view]]` | One catch-all, statically generated per view, `noindex, nofollow`, rendering **no records at all**. |
| A single trade | Addressed by URL **fragment**, never a path segment. |

The privacy boundary is therefore structural rather than procedural: the
prerendered HTML has nothing in it to leak, no RSC payload carries records, and
a fragment is never sent to a server, never logged, and needs no route per
record. Verified against the build output — `/en/app/*`, `/en/about` and the
home page contain no trade ids, prices or risk amounts.

There is no authentication and the UI says so. No session, no "signed in as",
no client-side identity pretending to be authorization.

### Domain model

`Trade` references canonical identities and copies nothing: `conceptIds` are
`TradingConceptId`, `setupId` is a Setup slug. There is no `JournalConcept` and
no `JournalSetup`. Validation rejects a dangling reference on write.

**No derived value is stored.** There is no P&L field, no R multiple, no
win/loss flag — those are computed from entry, stop and exit. Storing a figure
alongside its inputs is how a ledger starts disagreeing with itself.

`origin: "demo" | "user"` lives on the record itself, because a label kept
anywhere else can be lost when records move between views.

### Financial precision

Money is integer minor units; prices are scaled integers at 1e5. Ratios are
integer basis points, so R multiples and rates can still be summed and averaged
exactly. Division happens once, at the end, with `roundHalfAway` — chosen over
`Math.round` because the platform default is half-*up*, which is asymmetric
across zero and quietly biases losses on a ledger.

### Calculation and analytics

`calculations.ts` is pure per-trade arithmetic; `analytics.ts` aggregates. No
component contains a formula, and a test asserts that changing the demo records
changes the dashboard.

**Absence is not zero.** Every function returns `null` where the inputs do not
support an answer, and `null` renders as INSUFFICIENT DATA. Win rate and
expectancy are additionally withheld below five closed trades — a rate from
four trades is an anecdote with a percent sign. This is PROJECT_RULES §1
applied to the Journal exactly as the Setup Lab applies it.

This is also the §19 boundary for a future AI analyst: **this layer calculates,
the analyst explains.** A model must never produce a primary financial metric.

### Storage

`TradeRepository` is one async interface with a memory implementation and a
browser-local one. No component imports `localStorage`; a test enforces that.
A server-backed implementation is a new class and a different construction
call, not a UI rewrite — which is the whole point of the abstraction.

Reads are defensive: `localStorage` throws in private mode, can be disabled,
and can hold anything a previous version wrote. Malformed rows are dropped
using the same pure validation the domain uses.

### Trade capture and the review lifecycle

EPIC 09. The Journal became usable: records are created, edited, reviewed and
deleted rather than only read.

#### The form/domain boundary

A form holds strings; the domain holds integers, ISO instants and canonical
ids. `lib/journal/draft.ts` is the only place those meet, and it is a pure
function so every parsing rule is directly testable.

The rule it exists for: **bad input never becomes valid-looking data.**
`Number("")` is `0` and `Number("1,5")` is `NaN`, so a naive form records a
trade with a zero stop or a price that formats as "—" forever. Parsing is
explicit and refuses rather than coerces — no exponent notation, no thousands
separator, no empty-string-as-zero.

`parseDraft` runs its own parse pass and then `validateTrade`, the same domain
rules the repository enforces. There is exactly one definition of a valid
trade, so a record created through the form and one written by any future
importer are held to identical standards. All issues are collected before
returning: a form that reveals one error per submission is a form people
abandon.

Errors carry a stable `IssueCode`, not an English sentence. Matching on message
text to find a translation would tie every locale to the exact wording of a
developer string; a test asserts every code has copy in both locales.

#### What the form does not ask for

No P&L, no R multiple, no win/loss selector. Those are derived. A user who
could type a P&L could type one that disagrees with the prices beside it, and
then the journal is no longer evidence. Planned R is shown live from entry,
stop and target as a demonstration that the arithmetic is real — and as "—"
the moment its inputs are absent.

#### Trade lifecycle

`planned → open → closed`, with `cancelled` as a terminal state that is not a
loss. Status determines which calculations are valid: only a closed trade with
an exit produces an outcome, and the domain refuses an exit on a trade that is
not closed rather than inventing one to make a dashboard populate.

#### Review lifecycle

`notReviewed → inReview → reviewed`, **derived** from the record by
`reviewState`. A stored status could disagree with the review it describes; a
derived one cannot.

Completion is declared, never inferred. Opening a trade does not start a
review and answering three of four questions does not finish one. "Save as
draft" writes `complete: false` and the trade stays in the queue.

`complete` is optional and **absent means complete**. That is what lets every
EPIC 08 record migrate untouched: twelve demo trades and any review a user had
already saved keep meaning exactly what they meant.

Reviews are editable. A judgement made the evening of a trade is often wrong a
month later, and editing goes through the same repository call as creating.

#### Analytics recalculation

```text
mutation → repository → subscribe → re-read → every metric recomputes
```

One repository, one analytics engine, no component patching a number. Adding a
trade changes the dashboard without a line of code connecting the two, and
tests assert the arithmetic exactly: the difference a deleted trade makes to
net P&L equals its own realised P&L, because the values are integers.

#### Review intelligence

Counts, gated twice: the population must reach `MIN_INSIGHT`, and the leader
must be strictly ahead of the runner-up. Calling one of two equal counts "most
common" is an arbitrary choice presented as a result. Every insight carries the
denominator it rests on. No correlation is computed and no causality implied —
with a few dozen trades, "you lose more on Fridays" is noise in a costume.

#### Storage and migration

EPIC 08 wrote a bare array; EPIC 09 writes a versioned envelope. Migration is
deterministic and total — every input produces a result and there is no throw
path, because this runs during the first render and a corrupt `localStorage`
value must not show a blank screen.

Two rules: **nothing is discarded wholesale** — a single unreadable row does
not cost the user the other forty, rows are validated individually and only the
bad ones dropped — and **nothing is reinterpreted**, so migration reshapes the
envelope and never a field's meaning.

`from: 0` means nothing was stored and the demo set is seeded. Any other
version with zero rows means the user deleted everything, and re-seeding would
resurrect records they removed on purpose.

`validateTrade` is genuinely defensive rather than merely documented as such:
it guards array fields with `Array.isArray` because a stored row's
`conceptIds` may be missing entirely. Validation that can crash on malformed
data cannot be the thing that protects against it.

#### The privacy boundary, unchanged

Records are still client-only, still addressed by URL fragment, still never in
a static route. `/app/trades/new` is the one added route and it carries no id
— a trade being created does not have one yet. `resolveAppScreen` returns null
for anything unrecognised, so a trade id in the path is a 404 rather than a
silent fallback, and a test asserts no demo id appears in any generated route.

The fragment also carries a transient `saved` flag. Creating a trade navigates
`/app/trades/new → /app/trades`, and that param change **remounts** the shell —
verified in the browser — so component state holding a confirmation is
destroyed before it can render. The fragment is the one channel that survives
that boundary and is never sent to a server. It is stripped once announced.

#### Future server migration seam

`TradeRepository` is one async interface. A server-backed implementation is a
new class and a different construction call in `JournalApp`, not a UI rewrite;
every method is already async so a network adapter and a local one are the
same shape to the caller. Extending `Trade` with `source`, `broker`,
`externalTradeId` or `importedAt` for a future broker import needs no
migration — the migration reader passes unknown fields through and validates
what it knows. Attachments are the same story: the detail view is a list of
sections, so a `TradeAttachment` section is an addition rather than a redesign.

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

## Global navigation and interaction

The navigation tree, its state machine, the command palette and the search
provider abstraction are documented in **`docs/navigation.md`**. The points
that matter at the architecture level:

- One navigation model (`lib/navigation.ts`) drives the bar, mega menus, mobile
  drawer, footer, palette and route validation. `hrefFor` is the only place a
  URL is assembled and returns `null` for non-navigable destinations.
- Scroll-derived navigation state is written to a `data-state` attribute from
  the single shared frame loop. It causes zero React renders.
- Open surfaces store the route they were opened on, so closing on navigation
  is derived rather than an effect calling `setState` per route change.
- Search is a provider registry. No backend search exists; the one shipped
  provider indexes the navigation tree and the palette's commands.
- Both overlays share one dismissable-layer hook for focus, Escape and scroll
  locking.

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
6. **Mobile shares the desktop beat timeline.** Pacing, density and copy
   anchoring differ by breakpoint — a shorter track, fewer gridlines and
   ambient points, beat copy anchored to the chart rather than centred — but
   the nine beats occupy the same normalized ranges in both. A genuinely
   separate mobile timeline (§51) is still open.
7. **The static tier is the finished frame while the copy still scrubs.** If
   the canvas fails on a device that has not asked for reduced motion, the
   fallback shows the resolved end state while the beat narration continues to
   advance. §12 does not require parity and the frame is honest, but the two
   halves are describing different moments.


## Motion policy (EPIC 10 §6, §7)

One vocabulary, defined once in `app/globals.css` and used by name everywhere:

| Token | Duration | Job |
|---|---|---|
| `--motion-instant` | 120ms | State flips |
| `--motion-micro` | 240ms | Hover, focus |
| `--motion-interaction` | 420ms | Menus, panels |
| `--motion-transition` | 720ms | Route and section |
| `--motion-cinematic` | 1200ms | Hero beats |

Components pick a category, never a millisecond count, so the whole product can
be retimed from one place. Duration and easing are paired in the token because
they are one decision.

Motion intensity is deliberately **not** uniform across surfaces, and flattening
it would erase information the reader uses to tell where they are: hero is the
most cinematic, systems cinematic-on-scroll, the Setup Lab analytical, the
Academy editorial, the Dictionary minimal, and the Journal restrained. The
Journal's skeleton is unanimated for exactly this reason.

## The journal payload projection (EPIC 10 §16, §18)

`/app/*` was handed `dictionary.lab` whole, serializing the full specification
prose for all five setups — purpose, context, trigger, invalidation, review —
into all twelve application routes. Measured at **7,887 bytes raw / 2,921
gzipped per route, ~34 kB gzipped across the build**, for text the application
never renders; it needs five titles and three enum label maps.

`lib/journal/lab-view.ts` now projects exactly that, and its type cannot express
the prose. This is the same defect EPIC 04 found in the Navbar, which is why the
fix is a named projection with a test rather than a narrower prop: passing a
whole dictionary branch "in case the component wants it" is easy to do by
accident and invisible until someone weighs the HTML.

## Document language (EPIC 10 §30)

`lang` and `dir` are set on the locale wrapper in `app/[locale]/layout.tsx`,
which drives bidi and assistive technology for page content. The root layout
sits above the `[locale]` segment and cannot know the locale, so `<html>` itself
carried neither attribute — a WCAG 3.1.1 failure that also made screen readers
read Persian with an English voice.

The existing parse-blocking theme script now also sets both on `<html>` from the
first path segment, before first paint, with no hydration mismatch because the
server never renders them.

**Limitation, stated rather than papered over:** an agent that does not execute
JavaScript sees `<html>` without `lang`. The wrapper inside `<body>` still
carries both. Setting them server-side would mean moving the root layout inside
the locale segment, which is the change that left 404s unstyled — see the note
in `app/layout.tsx`.

A caution recorded because it shipped: `themeInitScript` is a template literal,
so `\/` in the source collapses to `/` in the emitted script. The first version
of this fix used a regex, produced a broken pattern, and the surrounding
`try/catch` swallowed it — leaving the attributes unset with no error anywhere.
It was caught only by a browser check asserting `<html dir>`. The script now
uses `split`, which has no escape sequence to get wrong.
