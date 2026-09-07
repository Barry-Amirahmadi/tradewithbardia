import { toMoney, toPrice } from "./money";
import type { StoredTrade } from "./trade";

/**
 * THE DEMO DATASET — master prompt §6, §13, §36, §37.
 *
 * Twelve trades. Enough that the dashboard, the analytics and the review queue
 * all have something real to compute from, and few enough that a reader can
 * scan the whole set and see there is no sleight of hand.
 *
 * EVERY RECORD CARRIES `origin: "demo"`. That is the field the UI reads to
 * label the interface, and it lives on the record rather than in a flag beside
 * it so the label cannot be lost when records move between views (§6).
 *
 * The numbers are illustrative and deliberately unimpressive: a mixed set with
 * real losses, a breakeven, an unreviewed trade, a cancelled plan and an open
 * position. Nothing here is a performance claim, and a demo that showed a
 * flattering curve would be the same dishonesty as a fabricated backtest —
 * PROJECT_RULES §1 applies to the Journal exactly as it does to the Setup Lab.
 *
 * Every displayed metric is computed from these records by `analytics.ts`. No
 * component contains a typed-in figure, and a test asserts that changing this
 * file changes the derived metrics.
 */

const RISK = toMoney(250);

function iso(day: number, hour: number): string {
  // Fixed dates so the dataset is deterministic across runs and machines.
  return new Date(Date.UTC(2026, 7, day, hour, 0, 0)).toISOString();
}

export const demoTrades: readonly StoredTrade[] = [
  {
    id: "demo-01", origin: "demo", status: "closed",
    instrument: "metals", direction: "short", session: "london", timeframe: "m15",
    setupId: "liquidity-sweep-reversal",
    conceptIds: ["liquidity", "sweep", "mss", "fvg"],
    entry: toPrice(2014.4), stop: toPrice(2018.2), target: toPrice(2003.0),
    exit: toPrice(2004.6), riskAmount: RISK,
    openedAt: iso(3, 9), closedAt: iso(3, 12),
    review: {
      rules: [
        { id: "context", adherence: "followed" },
        { id: "setup", adherence: "followed" },
        { id: "execution", adherence: "followed" },
        { id: "risk", adherence: "followed" },
      ],
      conceptIds: ["sweep", "mss"],
      observations: "Level was obvious before the session, not after.",
      reviewedAt: iso(3, 18),
    },
  },
  {
    id: "demo-02", origin: "demo", status: "closed",
    instrument: "indices", direction: "long", session: "newYork", timeframe: "m5",
    setupId: "session-open-displacement",
    conceptIds: ["context", "displacement", "fvg", "entry"],
    entry: toPrice(18320.5), stop: toPrice(18298.0), target: toPrice(18380.0),
    exit: toPrice(18297.5), riskAmount: RISK,
    openedAt: iso(4, 14), closedAt: iso(4, 15),
    review: {
      rules: [
        { id: "context", adherence: "followed" },
        { id: "setup", adherence: "violated", note: "Entered before the gap formed." },
        { id: "execution", adherence: "violated" },
        { id: "risk", adherence: "followed" },
      ],
      conceptIds: ["displacement", "entry"],
      lessons: "Waiting for the gap is the setup. Anticipating it is a different trade.",
      reviewedAt: iso(4, 19),
    },
  },
  {
    id: "demo-03", origin: "demo", status: "closed",
    instrument: "forex", direction: "long", session: "london", timeframe: "h1",
    setupId: "equal-highs-draw",
    conceptIds: ["liquidity", "equalHighs"],
    entry: toPrice(1.0842), stop: toPrice(1.0808), target: toPrice(1.0925),
    exit: toPrice(1.0921), riskAmount: RISK,
    openedAt: iso(5, 8), closedAt: iso(6, 11),
    review: {
      rules: [
        { id: "context", adherence: "followed" },
        { id: "setup", adherence: "followed" },
        { id: "execution", adherence: "followed" },
        { id: "risk", adherence: "notApplicable" },
      ],
      conceptIds: ["equalHighs", "liquidity"],
      reviewedAt: iso(6, 16),
    },
  },
  {
    id: "demo-04", origin: "demo", status: "closed",
    instrument: "indices", direction: "short", session: "newYork", timeframe: "m15",
    setupId: "structure-shift-continuation",
    conceptIds: ["structure", "bos", "displacement"],
    entry: toPrice(18410.0), stop: toPrice(18438.0), target: toPrice(18330.0),
    exit: toPrice(18437.0), riskAmount: RISK,
    openedAt: iso(7, 15), closedAt: iso(7, 17),
    review: {
      rules: [
        { id: "context", adherence: "violated", note: "Two swings inside a range, not a trend." },
        { id: "setup", adherence: "followed" },
        { id: "execution", adherence: "followed" },
        { id: "risk", adherence: "followed" },
      ],
      conceptIds: ["context", "structure"],
      lessons: "The trigger was clean. The context was not there.",
      reviewedAt: iso(7, 20),
    },
  },
  {
    id: "demo-05", origin: "demo", status: "closed",
    instrument: "metals", direction: "short", session: "newYork", timeframe: "m5",
    setupId: "liquidity-sweep-reversal",
    conceptIds: ["liquidity", "sweep", "mss", "invalidation"],
    entry: toPrice(2026.8), stop: toPrice(2030.4), target: toPrice(2016.0),
    exit: toPrice(2018.9), riskAmount: RISK,
    openedAt: iso(10, 13), closedAt: iso(10, 16),
    review: {
      rules: [
        { id: "context", adherence: "followed" },
        { id: "setup", adherence: "followed" },
        { id: "execution", adherence: "violated", note: "Closed early, before target." },
        { id: "risk", adherence: "followed" },
      ],
      conceptIds: ["execution"],
      reviewedAt: iso(10, 19),
    },
  },
  {
    id: "demo-06", origin: "demo", status: "closed",
    instrument: "forex", direction: "short", session: "london", timeframe: "m15",
    conceptIds: ["structure", "mss"],
    entry: toPrice(1.2710), stop: toPrice(1.2738), target: toPrice(1.2640),
    exit: toPrice(1.2710), riskAmount: RISK,
    openedAt: iso(11, 9), closedAt: iso(11, 12),
    review: {
      rules: [
        { id: "context", adherence: "unknown" },
        { id: "setup", adherence: "violated", note: "No written specification matched." },
        { id: "execution", adherence: "followed" },
        { id: "risk", adherence: "followed" },
      ],
      conceptIds: ["setup"],
      observations: "Closed flat. An improvised trade, recorded as one.",
      reviewedAt: iso(11, 18),
    },
  },
  {
    id: "demo-07", origin: "demo", status: "closed",
    instrument: "metals", direction: "long", session: "asia", timeframe: "h1",
    setupId: "range-to-expansion",
    conceptIds: ["context", "market", "displacement"],
    entry: toPrice(1998.2), stop: toPrice(1990.6), target: toPrice(2020.0),
    exit: toPrice(2016.4), riskAmount: RISK,
    openedAt: iso(12, 2), closedAt: iso(12, 10),
    review: {
      rules: [
        { id: "context", adherence: "followed" },
        { id: "setup", adherence: "followed" },
        { id: "execution", adherence: "followed" },
        { id: "risk", adherence: "violated", note: "Size chosen before the stop." },
      ],
      conceptIds: ["risk", "positionSize"],
      lessons: "Correct read, wrong sizing order.",
      reviewedAt: iso(12, 15),
    },
  },
  {
    id: "demo-08", origin: "demo", status: "closed",
    instrument: "indices", direction: "long", session: "newYork", timeframe: "m5",
    setupId: "session-open-displacement",
    conceptIds: ["displacement", "fvg", "entry"],
    entry: toPrice(18502.0), stop: toPrice(18484.0), target: toPrice(18556.0),
    exit: toPrice(18551.0), riskAmount: RISK,
    openedAt: iso(13, 14), closedAt: iso(13, 15),
    review: {
      rules: [
        { id: "context", adherence: "followed" },
        { id: "setup", adherence: "followed" },
        { id: "execution", adherence: "followed" },
        { id: "risk", adherence: "followed" },
      ],
      conceptIds: ["fvg", "displacement"],
      reviewedAt: iso(13, 18),
    },
  },
  {
    id: "demo-09", origin: "demo", status: "closed",
    instrument: "forex", direction: "long", session: "london", timeframe: "m15",
    setupId: "equal-highs-draw",
    conceptIds: ["liquidity", "equalHighs", "entry"],
    entry: toPrice(1.0902), stop: toPrice(1.0879), target: toPrice(1.0960),
    exit: toPrice(1.0880), riskAmount: RISK,
    openedAt: iso(14, 8), closedAt: iso(14, 13),
    // Closed, deliberately not reviewed — the dashboard needs a real queue.
  },
  {
    id: "demo-10", origin: "demo", status: "closed",
    instrument: "metals", direction: "short", session: "london", timeframe: "m15",
    setupId: "liquidity-sweep-reversal",
    conceptIds: ["liquidity", "sweep", "fvg"],
    entry: toPrice(2033.5), stop: toPrice(2037.9), target: toPrice(2021.0),
    exit: toPrice(2023.8), riskAmount: RISK,
    openedAt: iso(17, 10), closedAt: iso(17, 14),
    review: {
      rules: [
        { id: "context", adherence: "followed" },
        { id: "setup", adherence: "followed" },
        { id: "execution", adherence: "followed" },
        { id: "risk", adherence: "followed" },
      ],
      conceptIds: ["sweep", "fvg"],
      reviewedAt: iso(17, 19),
    },
  },
  {
    id: "demo-11", origin: "demo", status: "open",
    instrument: "indices", direction: "long", session: "newYork", timeframe: "m15",
    setupId: "structure-shift-continuation",
    conceptIds: ["structure", "bos"],
    entry: toPrice(18610.0), stop: toPrice(18578.0), target: toPrice(18700.0),
    riskAmount: RISK,
    openedAt: iso(18, 14),
  },
  {
    id: "demo-12", origin: "demo", status: "cancelled",
    instrument: "forex", direction: "short", session: "asia", timeframe: "h1",
    setupId: "range-to-expansion",
    conceptIds: ["context", "market"],
    entry: toPrice(0.6612), stop: toPrice(0.6641), target: toPrice(0.6540),
    riskAmount: RISK,
    openedAt: iso(19, 1),
    notes: "Range never broke. Conditions did not arrive, so no trade.",
  },
];
