import type { TradingConceptId } from "../trading/concepts";
import {
  adherenceRate,
  closedTrades,
  isReviewed,
  outcome,
  realisedPnl,
  rMultiple,
} from "./calculations";
import {
  meanBasisPoints,
  meanMoney,
  ratioToBasisPoints,
  sumMoney,
  type BasisPoints,
  type Money,
} from "./money";
import type { Trade } from "./trade";

/**
 * THE ANALYTICS ENGINE — master prompt §6, §7, §17, §18, §19, §37.
 *
 * Pure aggregation over a set of trades. Every number the dashboard shows is
 * produced here and nowhere else, which is the §37 requirement stated as
 * architecture: change the demo records and the metrics change, because no
 * component contains a typed-in figure.
 *
 * MINIMUM SAMPLES. Several statistics are meaningless below a certain count —
 * a "win rate" from two trades is not a rate, it is an anecdote with a
 * percent sign. Those return `null`, and `null` renders INSUFFICIENT DATA.
 * This mirrors PROJECT_RULES §1: the Setup Lab refuses to show performance it
 * cannot support, and so does the Journal.
 *
 * This layer is also the §19 boundary. It calculates; a future AI analyst
 * reads its output and explains it. A model never computes a primary metric.
 */

/** Below this, a rate describes the sample rather than the process. */
export const MIN_SAMPLE = 5;

export interface PerformanceSummary {
  /** Trades that produced an outcome. */
  sample: number;
  netPnl: Money | null;
  averagePnl: Money | null;
  /** Mean R across closed trades, in basis points. */
  averageR: BasisPoints | null;
  wins: number;
  losses: number;
  breakeven: number;
  /** Null below MIN_SAMPLE — see above. */
  winRate: BasisPoints | null;
  /** Mean money per trade. Null below MIN_SAMPLE. */
  expectancy: Money | null;
  /** Largest peak-to-trough fall of the cumulative curve, in minor units. */
  maxDrawdown: Money | null;
  bestR: BasisPoints | null;
  worstR: BasisPoints | null;
}

export function performance(trades: readonly Trade[]): PerformanceSummary {
  const closed = closedTrades(trades);
  const pnls = closed.map(realisedPnl).filter((v): v is Money => v !== null);
  const rs = closed.map(rMultiple).filter((v): v is BasisPoints => v !== null);
  const outcomes = closed.map(outcome);

  const wins = outcomes.filter((o) => o === "win").length;
  const losses = outcomes.filter((o) => o === "loss").length;
  const breakeven = outcomes.filter((o) => o === "breakeven").length;
  const enough = pnls.length >= MIN_SAMPLE;

  return {
    sample: closed.length,
    netPnl: pnls.length > 0 ? sumMoney(pnls) : null,
    averagePnl: meanMoney(pnls),
    averageR: meanBasisPoints(rs),
    wins,
    losses,
    breakeven,
    // Breakeven trades stay in the denominator: they happened, and excluding
    // them would inflate the rate.
    winRate: enough ? ratioToBasisPoints(wins, closed.length) : null,
    expectancy: enough ? meanMoney(pnls) : null,
    maxDrawdown: pnls.length > 0 ? maxDrawdown(pnls) : null,
    bestR: rs.length > 0 ? Math.max(...rs) : null,
    worstR: rs.length > 0 ? Math.min(...rs) : null,
  };
}

/**
 * Largest peak-to-trough decline of the running total, as a positive number.
 *
 * Order matters, so the caller must pass trades in the order they closed —
 * `performance` receives them in repository order, which is chronological.
 */
export function maxDrawdown(pnls: readonly Money[]): Money {
  let peak = 0;
  let running = 0;
  let worst = 0;
  for (const pnl of pnls) {
    running += pnl;
    if (running > peak) peak = running;
    const decline = peak - running;
    if (decline > worst) worst = decline;
  }
  return worst;
}

export interface ProcessSummary {
  total: number;
  reviewed: number;
  /** Share of trades with a review. Always available — it is a count, not a rate of outcomes. */
  reviewRate: BasisPoints | null;
  /** Mean rule adherence across reviewed trades. */
  adherence: BasisPoints | null;
  /** Trades closed but not yet reviewed — the queue the dashboard surfaces. */
  awaitingReview: number;
  planned: number;
  open: number;
  cancelled: number;
}

export function process(trades: readonly Trade[]): ProcessSummary {
  const reviewed = trades.filter(isReviewed);
  const rates = reviewed
    .map(adherenceRate)
    .filter((v): v is BasisPoints => v !== null);

  return {
    total: trades.length,
    reviewed: reviewed.length,
    reviewRate: trades.length > 0 ? ratioToBasisPoints(reviewed.length, trades.length) : null,
    adherence: meanBasisPoints(rates),
    awaitingReview: closedTrades(trades).filter((t) => !isReviewed(t)).length,
    planned: trades.filter((t) => t.status === "planned").length,
    open: trades.filter((t) => t.status === "open").length,
    cancelled: trades.filter((t) => t.status === "cancelled").length,
  };
}

export interface UsageRow<T extends string = string> {
  id: T;
  count: number;
  /** Outcome split, present only where the trades were closed. */
  wins: number;
  losses: number;
}

/**
 * How often each canonical concept appears, and how those trades resolved.
 *
 * This is the structure that makes "which concepts appear in my losing
 * trades?" answerable later. It is deliberately a count, not an inference —
 * no correlation is claimed, and none should be until the sample supports it.
 */
export function conceptUsage(trades: readonly Trade[]): readonly UsageRow<TradingConceptId>[] {
  const rows = new Map<TradingConceptId, UsageRow<TradingConceptId>>();

  for (const trade of trades) {
    // Concepts tagged on the trade and in its review both count — the review
    // is where a trader names what actually mattered.
    const ids = new Set<TradingConceptId>([
      ...trade.conceptIds,
      ...(trade.review?.conceptIds ?? []),
    ]);
    const result = outcome(trade);
    for (const id of ids) {
      const row = rows.get(id) ?? { id, count: 0, wins: 0, losses: 0 };
      row.count += 1;
      if (result === "win") row.wins += 1;
      if (result === "loss") row.losses += 1;
      rows.set(id, row);
    }
  }

  return [...rows.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/** The same, per Setup. Setup ids stay canonical slugs. */
export function setupUsage(trades: readonly Trade[]): readonly UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const trade of trades) {
    if (trade.setupId === undefined) continue;
    const row = rows.get(trade.setupId) ?? { id: trade.setupId, count: 0, wins: 0, losses: 0 };
    row.count += 1;
    const result = outcome(trade);
    if (result === "win") row.wins += 1;
    if (result === "loss") row.losses += 1;
    rows.set(trade.setupId, row);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/** Rules violated most often — the research view that suggests what to fix. */
export function ruleViolations(trades: readonly Trade[]): readonly UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const trade of trades) {
    for (const rule of trade.review?.rules ?? []) {
      if (rule.adherence !== "violated") continue;
      const row = rows.get(rule.id) ?? { id: rule.id, count: 0, wins: 0, losses: 0 };
      row.count += 1;
      const result = outcome(trade);
      if (result === "win") row.wins += 1;
      if (result === "loss") row.losses += 1;
      rows.set(rule.id, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * REVIEW INTELLIGENCE — master prompt §22, §23.
 *
 * Structured observations derived from records. No AI, no model, no
 * correlation, no causality — §22 permits counts and forbids the rest, and
 * that restriction is the honest one: with a few dozen trades, "you lose more
 * on Fridays" is noise wearing the costume of a finding.
 *
 * TWO GATES, and an insight appears only if it passes both.
 *
 * **Sample.** The population behind the claim must reach `MIN_INSIGHT`. Below
 * that the answer describes the sample rather than the trader.
 *
 * **Distinguishability.** The leader must be strictly ahead of the runner-up.
 * Calling one of two equal counts "most common" is an arbitrary choice
 * presented as a result — the sort of small dishonesty that costs a product
 * its credibility faster than being wrong loudly.
 *
 * Each insight carries its own numbers so the interface can show what the
 * claim rests on. The wording lives in the dictionaries: an insight is data,
 * and baking an English sentence in here would make it untranslatable and
 * unverifiable at once.
 */

/** The smallest population an observation may describe. */
export const MIN_INSIGHT = 5;

export type InsightKind =
  | "topSetup"
  | "topConcept"
  | "topViolation"
  | "reviewCompletion";

export interface Insight {
  kind: InsightKind;
  /** Canonical id of the subject — a setup slug, a concept id, a rule id. */
  subjectId?: string;
  /** How many records support the observation. */
  count: number;
  /** The population it was drawn from. Always shown beside the count. */
  total: number;
}

/** The leader of a usage table, or null when it is a tie or too small. */
function leader(
  rows: readonly UsageRow[],
  total: number,
): { id: string; count: number } | null {
  if (total < MIN_INSIGHT) return null;
  const [first, second] = rows;
  if (first === undefined) return null;
  if (second !== undefined && second.count === first.count) return null;
  return { id: first.id, count: first.count };
}

export function insights(trades: readonly Trade[]): readonly Insight[] {
  const found: Insight[] = [];

  const withSetup = trades.filter((trade) => trade.setupId !== undefined);
  const topSetup = leader(setupUsage(trades), withSetup.length);
  if (topSetup !== null) {
    found.push({
      kind: "topSetup",
      subjectId: topSetup.id,
      count: topSetup.count,
      total: withSetup.length,
    });
  }

  const tagged = trades.filter(
    (trade) => trade.conceptIds.length > 0 || (trade.review?.conceptIds.length ?? 0) > 0,
  );
  const topConcept = leader(conceptUsage(trades), tagged.length);
  if (topConcept !== null) {
    found.push({
      kind: "topConcept",
      subjectId: topConcept.id,
      count: topConcept.count,
      total: tagged.length,
    });
  }

  // Violations are counted against reviewed trades, not all trades: a rule
  // cannot be observed as broken on a trade nobody reviewed, so the wider
  // denominator would understate every rate here.
  const reviewed = trades.filter(isReviewed);
  const topViolation = leader(ruleViolations(trades), reviewed.length);
  if (topViolation !== null) {
    found.push({
      kind: "topViolation",
      subjectId: topViolation.id,
      count: topViolation.count,
      total: reviewed.length,
    });
  }

  // Review completion is a count of work done, not a claim about the market,
  // so it needs no distinguishability gate — only enough records to mean
  // something.
  const closed = closedTrades(trades);
  if (closed.length >= MIN_INSIGHT) {
    found.push({
      kind: "reviewCompletion",
      count: closed.filter(isReviewed).length,
      total: closed.length,
    });
  }

  return found;
}

/**
 * WHOSE DATA IS ON SCREEN — master prompt §27, §50.
 *
 * Derived from the records themselves rather than from a stored flag, so the
 * label cannot drift from what is actually being displayed. `mixed` is a real
 * state and is reported as such: once a user adds a trade beside the demo set,
 * calling the whole thing "demo data" would be false, and calling it "your
 * data" would be worse.
 */
export type StorageMode = "empty" | "demo" | "local" | "mixed";

export function storageMode(trades: readonly { origin: string }[]): StorageMode {
  if (trades.length === 0) return "empty";
  const demo = trades.some((trade) => trade.origin === "demo");
  const user = trades.some((trade) => trade.origin === "user");
  if (demo && user) return "mixed";
  return demo ? "demo" : "local";
}
