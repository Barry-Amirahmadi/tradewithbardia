import {
  ratioToBasisPoints,
  roundHalfAway,
  type BasisPoints,
  type Money,
} from "./money";
import type { Trade } from "./trade";

/**
 * TRADE CALCULATIONS — master prompt §6, §7, §19.
 *
 * Pure functions over one trade. No React, no formatting, no locale, no DOM —
 * which is what lets every one of them be tested directly, and what keeps
 * financial formulas out of components (§7).
 *
 * THE RULE THAT MATTERS: a figure is either derived from the record or it does
 * not exist. Every function here returns `null` when the inputs do not support
 * an answer, and the UI renders INSUFFICIENT DATA for null rather than a zero.
 * Zero is a result; null is the absence of one, and conflating them is how a
 * dashboard starts lying.
 *
 * This is also the boundary §19 draws for the future AI analyst: **this layer
 * calculates, the analyst explains.** A model must never produce a primary
 * financial metric itself.
 */

/** Distance from entry to stop, in scaled price units. Always positive. */
export function riskDistance(trade: Trade): number {
  return Math.abs(trade.entry - trade.stop);
}

/**
 * Distance actually captured, signed by direction.
 *
 * A long that exits above entry is positive; a short that exits below entry is
 * positive. Getting this sign wrong inverts every downstream figure, which is
 * why direction is validated against the stop when a trade is created.
 */
export function realisedDistance(trade: Trade): number | null {
  if (trade.exit === undefined || trade.status !== "closed") return null;
  return trade.direction === "long" ? trade.exit - trade.entry : trade.entry - trade.exit;
}

/**
 * Realised profit or loss, in minor units.
 *
 * Derived from the ratio of captured distance to risked distance, applied to
 * the amount that was actually at risk. This deliberately needs no position
 * size, no contract multiplier and no instrument tick value — quantities the
 * journal does not ask for and therefore must not pretend to know.
 *
 * One division, one rounding, at the end.
 */
export function realisedPnl(trade: Trade): Money | null {
  const captured = realisedDistance(trade);
  if (captured === null) return null;
  const risked = riskDistance(trade);
  if (risked === 0) return null;
  return roundHalfAway((captured / risked) * trade.riskAmount);
}

/**
 * R multiple in basis points — 1R is 10 000.
 *
 * Kept as an integer so a set of R multiples can be summed and averaged
 * exactly; only the display divides again.
 */
export function rMultiple(trade: Trade): BasisPoints | null {
  const captured = realisedDistance(trade);
  if (captured === null) return null;
  const risked = riskDistance(trade);
  if (risked === 0) return null;
  return ratioToBasisPoints(captured, risked);
}

/** Planned reward-to-risk, available before the trade is taken. */
export function plannedR(trade: Trade): BasisPoints | null {
  if (trade.target === undefined) return null;
  const risked = riskDistance(trade);
  if (risked === 0) return null;
  const reward =
    trade.direction === "long" ? trade.target - trade.entry : trade.entry - trade.target;
  return ratioToBasisPoints(reward, risked);
}

/**
 * `breakeven` is a real third outcome, not a rounding artefact.
 *
 * Collapsing it into "win" or "loss" would misstate a win rate, which is
 * exactly the sort of quiet inaccuracy §6 forbids.
 */
export type TradeOutcome = "win" | "loss" | "breakeven";

export function outcome(trade: Trade): TradeOutcome | null {
  const pnl = realisedPnl(trade);
  if (pnl === null) return null;
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

/** How long the position was held, in whole minutes. */
export function holdingMinutes(trade: Trade): number | null {
  if (trade.closedAt === undefined) return null;
  const opened = Date.parse(trade.openedAt);
  const closed = Date.parse(trade.closedAt);
  if (Number.isNaN(opened) || Number.isNaN(closed) || closed < opened) return null;
  return Math.round((closed - opened) / 60_000);
}

/** Trades that produced an outcome. Everything statistical starts here. */
export function closedTrades(trades: readonly Trade[]): readonly Trade[] {
  return trades.filter((trade) => trade.status === "closed" && trade.exit !== undefined);
}

/**
 * Whether a trade was reviewed. Separate from whether it won — that
 * separation is the product's central claim, so it is a function, not a flag
 * someone might set by hand.
 */
export function isReviewed(trade: Trade): boolean {
  return trade.review !== undefined;
}

/**
 * Rule adherence for one trade: followed / total applicable.
 *
 * `notApplicable` and `unknown` are excluded from the denominator. Counting an
 * inapplicable rule as a violation would punish a trader for a rule that never
 * applied, and counting it as followed would inflate the figure.
 */
export function adherenceRate(trade: Trade): BasisPoints | null {
  const rules = trade.review?.rules ?? [];
  const applicable = rules.filter(
    (rule) => rule.adherence === "followed" || rule.adherence === "violated",
  );
  if (applicable.length === 0) return null;
  const followed = applicable.filter((rule) => rule.adherence === "followed").length;
  return ratioToBasisPoints(followed, applicable.length);
}
