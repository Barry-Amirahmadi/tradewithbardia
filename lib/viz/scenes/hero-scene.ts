import type { Annotation, Candle, SceneStage, TradingScene } from "../types";

/**
 * HERO SCENE — master prompt §19, §20.
 *
 * The scroll timeline walks one setup end to end: context, liquidity, sweep,
 * market structure shift, fair value gap, entry with a defined stop and
 * target.
 *
 * The price series is SYNTHETIC and the scene is tagged `provenance:
 * "synthetic"` so every renderer is obliged to say so on screen. This is not a
 * backtest, a trade record, or a performance claim — §26 and §77.1/§77.13.
 *
 * Structure is scripted; texture is seeded noise. That combination is
 * deliberate: the story must land identically every time, and the same seed
 * must produce byte-identical output on the server and the client so the
 * static fallback and the canvas upgrade agree.
 */

/** mulberry32 — small, fast, and deterministic across engines. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Segment {
  /** Close price this segment ends on. */
  to: number;
  count: number;
  /** Bar-to-bar noise amplitude, in price units. */
  vol: number;
  /**
   * Absolute high forced onto the first bar of the segment. The sweep must
   * visibly take the level out; leaving that to the noise term produced an
   * overshoot of four hundredths of a point, which reads as no sweep at all.
   * Anything the narrative depends on is scripted, then asserted below.
   */
  spikeHigh?: number;
}

/**
 * Control points for the narrative. Prices sit near 2000 because gold is one
 * of the instruments actually being researched; nothing downstream depends on
 * the absolute level.
 */
const START_PRICE = 2001;

const segments: readonly Segment[] = [
  { to: 1999.4, count: 6, vol: 1.5 }, // chop
  { to: 2003.2, count: 6, vol: 1.6 }, // chop
  { to: 2000.1, count: 6, vol: 1.5 }, // chop — 18 bars of noise
  { to: 2011.0, count: 6, vol: 1.3 }, // impulse up
  { to: 2007.4, count: 3, vol: 1.0 }, // higher low
  { to: 2018.4, count: 6, vol: 1.2 }, // swing high forms — buy-side liquidity
  { to: 2010.6, count: 5, vol: 1.1 }, // pullback, sets the swing low
  { to: 2016.8, count: 5, vol: 1.0 }, // return toward the high
  { to: 2013.2, count: 3, vol: 1.6, spikeHigh: 2022.6 }, // sweep, then close back
  // Displacement. Low volatility against a steep slope is what actually
  // produces an unfilled gap — a noisy drop of the same distance fills its
  // own imbalance bar by bar and leaves nothing to trade.
  { to: 2000.6, count: 6, vol: 0.4 },
  // Retrace has to stall INSIDE the gap. Running above it fills the imbalance
  // and there is no longer a reason for the entry to be where it is.
  { to: 2006.1, count: 5, vol: 0.7 },
  { to: 1999.0, count: 9, vol: 1.2 }, // resolution toward target
];

const SWEEP_START = 43; // first index of the sweep segment
const DROP_START = 46;
const RETRACE_START = 52;
const RETRACE_END = 56;

function buildCandles(): Candle[] {
  const rand = mulberry32(0x7b0d1a);
  const candles: Candle[] = [];
  let previousClose = START_PRICE;
  let index = 0;

  for (const segment of segments) {
    const from = previousClose;
    for (let step = 1; step <= segment.count; step += 1) {
      const t = step / segment.count;
      // Ease the leg so impulses look impulsive and ranges look listless.
      const eased = t * t * (3 - 2 * t);
      const drift = from + (segment.to - from) * eased;
      const close = drift + (rand() - 0.5) * segment.vol * 2;
      const open = previousClose;

      const body = Math.abs(close - open);
      const wick = segment.vol * (0.35 + rand() * 0.85) + body * 0.15;

      let high = Math.max(open, close) + wick * rand();
      if (step === 1 && segment.spikeHigh !== undefined) {
        high = Math.max(high, segment.spikeHigh);
      }

      candles.push({
        t: index,
        o: round(open),
        h: round(high),
        l: round(Math.min(open, close) - wick * rand()),
        c: round(close),
      });

      previousClose = close;
      index += 1;
    }
  }

  return candles;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function highestHigh(candles: readonly Candle[], from: number, to: number) {
  let best = { index: from, price: -Infinity };
  for (let i = from; i <= to && i < candles.length; i += 1) {
    const candle = candles[i];
    if (candle !== undefined && candle.h > best.price) {
      best = { index: i, price: candle.h };
    }
  }
  return best;
}

function lowestLow(candles: readonly Candle[], from: number, to: number) {
  let best = { index: from, price: Infinity };
  for (let i = from; i <= to && i < candles.length; i += 1) {
    const candle = candles[i];
    if (candle !== undefined && candle.l < best.price) {
      best = { index: i, price: candle.l };
    }
  }
  return best;
}

/**
 * A bearish fair value gap is the unfilled space between the low of candle
 * i-1 and the high of candle i+1 across an impulsive leg. Derived from the
 * generated series rather than hardcoded, so the annotation can never drift
 * away from the candles it is describing.
 */
function findBearishFvg(candles: readonly Candle[], from: number, to: number) {
  let widest: { index: number; top: number; bottom: number } | null = null;

  for (let i = from + 1; i < to && i + 1 < candles.length; i += 1) {
    const before = candles[i - 1];
    const after = candles[i + 1];
    if (before === undefined || after === undefined) continue;
    if (before.l <= after.h) continue;

    const size = before.l - after.h;
    if (widest === null || size > widest.top - widest.bottom) {
      widest = { index: i, top: before.l, bottom: after.h };
    }
  }

  return widest;
}

function buildScene(): TradingScene {
  const candles = buildCandles();
  const last = candles.length - 1;

  const liquidityHigh = highestHigh(candles, 18, SWEEP_START - 1);
  const sweep = highestHigh(candles, SWEEP_START, DROP_START - 1);
  // The swing low that the displacement has to break for the shift to count.
  // Measured from the pullback only — widening this window would pick up the
  // start of the rally instead and the break line would sit in empty space.
  const structureLow = lowestLow(candles, 33, SWEEP_START - 1);
  const retraceHigh = highestHigh(candles, RETRACE_START, RETRACE_END);
  const dropLow = lowestLow(candles, DROP_START, RETRACE_START - 1);

  const fvg = findBearishFvg(candles, DROP_START, RETRACE_START);
  // The generator is deterministic, so this leg always produces a gap; the
  // guard exists so a future tweak to `segments` fails loudly here rather
  // than silently rendering a setup with no location.
  if (fvg === null) {
    throw new Error(
      "hero-scene: no fair value gap in the impulsive leg — the segment table changed and the scene no longer tells its own story.",
    );
  }

  // The scene is a teaching diagram, so every claim it makes visually has to
  // hold in the data. These assertions run at module load: if a future edit to
  // `segments` breaks the narrative, the build fails instead of shipping a
  // chart that shows a sweep that never swept or an entry with no reason.
  if (sweep.price < liquidityHigh.price + 1.5) {
    throw new Error(
      `hero-scene: sweep high ${sweep.price} does not clearly take the liquidity level ${liquidityHigh.price}.`,
    );
  }
  if (structureLow.price <= fvg.top) {
    throw new Error(
      `hero-scene: displacement never broke the swing low ${structureLow.price}, so there is no market structure shift.`,
    );
  }
  if (retraceHigh.price > fvg.top + 0.5) {
    throw new Error(
      `hero-scene: retrace high ${retraceHigh.price} ran past the gap top ${fvg.top} — the imbalance is filled and the entry is unmotivated.`,
    );
  }

  const entry = round((fvg.top + fvg.bottom) / 2);
  const stop = round(Math.max(retraceHigh.price, fvg.top) + 0.6);
  // Target is the low the displacement already printed, not the low of the
  // opening range. Both are defensible; the nearer one keeps the diagram's
  // implied R in ordinary territory instead of showing an outlier as if it
  // were typical.
  const target = round(dropLow.price - 0.3);

  const annotations: Annotation[] = [
    {
      kind: "swing",
      id: "swing-high",
      index: liquidityHigh.index,
      price: liquidityHigh.price,
      side: "high",
    },
    {
      kind: "swing",
      id: "swing-low",
      index: structureLow.index,
      price: structureLow.price,
      side: "low",
    },
    {
      kind: "liquidity",
      id: "liquidity-buyside",
      price: liquidityHigh.price,
      fromIndex: liquidityHigh.index,
      toIndex: sweep.index,
      side: "buy",
    },
    {
      kind: "sweep",
      id: "sweep",
      index: sweep.index,
      price: sweep.price,
    },
    {
      kind: "structure",
      id: "mss",
      price: structureLow.price,
      fromIndex: structureLow.index,
      toIndex: Math.min(RETRACE_START, last),
    },
    {
      kind: "zone",
      id: "fvg",
      fromIndex: fvg.index - 1,
      toIndex: last,
      top: fvg.top,
      bottom: fvg.bottom,
      tone: "short",
    },
    {
      kind: "level",
      id: "entry",
      price: entry,
      fromIndex: RETRACE_END,
      toIndex: last,
      role: "entry",
    },
    {
      kind: "level",
      id: "stop",
      price: stop,
      fromIndex: RETRACE_END,
      toIndex: last,
      role: "stop",
    },
    {
      kind: "level",
      id: "target",
      price: target,
      fromIndex: RETRACE_END,
      toIndex: last,
      role: "target",
    },
  ];

  // Stage boundaries follow the §20 timeline.
  const stages: SceneStage[] = [
    { id: "market", start: 0.0, end: 0.1, revealTo: 14, reveals: [] },
    { id: "noise", start: 0.1, end: 0.2, revealTo: 18, reveals: [] },
    {
      id: "structure",
      start: 0.2,
      end: 0.3,
      revealTo: 38,
      reveals: ["swing-high", "swing-low"],
    },
    {
      id: "liquidity",
      start: 0.3,
      end: 0.42,
      revealTo: SWEEP_START,
      reveals: ["liquidity-buyside"],
    },
    {
      id: "sweep",
      start: 0.42,
      end: 0.52,
      revealTo: DROP_START,
      reveals: ["sweep"],
    },
    {
      id: "mss",
      start: 0.52,
      end: 0.62,
      revealTo: RETRACE_START,
      reveals: ["mss"],
    },
    {
      id: "fvg",
      start: 0.62,
      end: 0.75,
      revealTo: RETRACE_END + 1,
      reveals: ["fvg"],
    },
    {
      id: "entry",
      start: 0.75,
      end: 0.85,
      revealTo: Math.min(RETRACE_END + 6, candles.length),
      reveals: ["entry", "stop", "target"],
    },
    {
      id: "system",
      start: 0.85,
      end: 1.0,
      revealTo: candles.length,
      reveals: [],
    },
  ];

  return {
    id: "hero.one-setup",
    provenance: "synthetic",
    candles,
    annotations,
    stages,
    // Opens mid-range, so the first thing a visitor sees is a market rather
    // than an empty axis waiting for them to scroll.
    initialReveal: 8,
  };
}

/** Built once at module load — the scene is immutable and shared. */
export const heroScene: TradingScene = buildScene();
