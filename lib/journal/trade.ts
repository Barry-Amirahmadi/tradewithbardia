import { isTradingConceptId, type TradingConceptId } from "../trading/concepts";
import { getSetup } from "../trading/setups";
import type { Money, Price } from "./money";

/**
 * THE TRADE DOMAIN MODEL — master prompt §4, §5, §20, §21.
 *
 * A trade is a record of a decision, not a number. The model reflects that:
 * it stores what was intended, what was done, and what happened, and it keeps
 * those three separable.
 *
 * CANONICAL REFERENCES, NEVER COPIES:
 *
 * - `conceptIds` are `TradingConceptId` — the same identities the Trading
 *   System highlights, the Setup Lab tags, the Academy teaches and the
 *   Dictionary defines. There is no `JournalConcept`.
 * - `setupId` is a Setup slug. The Setup Lab remains the source of truth; a
 *   trade claims membership, it does not carry a copy of the specification.
 *
 * That is what will later make "which concepts appear most often in my losing
 * trades?" answerable without a migration.
 *
 * WHAT IS NOT HERE: no P&L field, no R multiple, no win/loss flag. Those are
 * *derived* (`calculations.ts`) from entry, stop and exit. Storing a computed
 * value alongside its inputs is how a ledger starts disagreeing with itself —
 * and a stored P&L can be wrong in a way an arithmetic one cannot.
 */

export const tradeDirections = ["long", "short"] as const;
export type TradeDirection = (typeof tradeDirections)[number];

/**
 * `planned` — written down, not taken. Recording these is the point: a
 *             journal that only holds executed trades cannot show discipline.
 * `open`     — position taken, not yet closed.
 * `closed`   — exited. Only closed trades produce outcomes.
 * `cancelled`— the conditions never arrived. Not a loss.
 */
export const tradeStatuses = ["planned", "open", "closed", "cancelled"] as const;
export type TradeStatus = (typeof tradeStatuses)[number];

export const tradeInstruments = ["indices", "metals", "forex"] as const;
export type TradeInstrument = (typeof tradeInstruments)[number];

export const tradeSessions = ["asia", "london", "newYork"] as const;
export type TradeSession = (typeof tradeSessions)[number];

export const tradeTimeframes = ["m1", "m5", "m15", "h1", "h4"] as const;
export type TradeTimeframe = (typeof tradeTimeframes)[number];

/** Whether the trader followed their own system — §10. */
export const adherenceStates = ["followed", "violated", "notApplicable", "unknown"] as const;
export type Adherence = (typeof adherenceStates)[number];

/**
 * The smallest abstraction that can later carry setup-specific rules (§10).
 *
 * A rule names what was expected and what was observed, and the adherence is
 * the trader's judgement of the two. Today the rules are the six review
 * dimensions; when setups gain machine-checkable conditions, the same shape
 * holds a generated rule with an automatic `observed`.
 */
export interface RuleCheck {
  /** Stable id — a review dimension today, a setup condition later. */
  id: string;
  adherence: Adherence;
  note?: string;
}

/**
 * Structured review — §9, §35.
 *
 * The value of a journal is here. Free text is kept, but the classifications
 * beside it are what make a hundred trades into data rather than a diary, and
 * `conceptIds` is what connects a mistake to the rest of the product.
 */
export interface TradeReview {
  /** One check per review dimension. */
  rules: readonly RuleCheck[];
  /** Canonical concepts the reviewer judged relevant to the outcome. */
  conceptIds: readonly TradingConceptId[];
  observations?: string;
  lessons?: string;
  reviewedAt: string;
  /**
   * Whether the reviewer finished — EPIC 09 §19.
   *
   * **Absent means complete.** That default is what makes every EPIC 08 record
   * migrate without being touched: twelve demo trades and any review a user
   * had already saved keep meaning exactly what they meant, and the field only
   * carries information when it says `false`.
   *
   * A review is never marked complete by the application. Opening a trade,
   * viewing it, or partially answering does not finish it — §19 forbids
   * inferring completion, so this is set by the save action and nothing else.
   */
  complete?: boolean;
}

/**
 * THE REVIEW LIFECYCLE — §19.
 *
 * Three states, derived from the record rather than stored beside it. A stored
 * status could disagree with the review it describes; a derived one cannot.
 */
export const reviewStates = ["notReviewed", "inReview", "reviewed"] as const;
export type ReviewState = (typeof reviewStates)[number];

export function reviewState(trade: Trade): ReviewState {
  if (trade.review === undefined) return "notReviewed";
  return trade.review.complete === false ? "inReview" : "reviewed";
}

export interface Trade {
  id: string;
  status: TradeStatus;

  instrument: TradeInstrument;
  direction: TradeDirection;
  session?: TradeSession;
  timeframe?: TradeTimeframe;

  /** Canonical Setup slug. Never a copy of the setup. */
  setupId?: string;
  /** Canonical concept ids. Never a copy of a definition. */
  conceptIds: readonly TradingConceptId[];

  /** Scaled integers — see money.ts. Floats are never stored. */
  entry: Price;
  stop: Price;
  target?: Price;
  exit?: Price;

  /** Minor units risked if the stop is hit. The basis for every R figure. */
  riskAmount: Money;

  /** ISO-8601. Locale formatting happens at the edge, never in the record. */
  openedAt: string;
  closedAt?: string;

  notes?: string;
  review?: TradeReview;
}

/**
 * The reason `origin` exists at all.
 *
 * §6 forbids any ambiguity between demo and real records. A boolean on the
 * record itself is the only place that cannot be lost: a filter can be
 * forgotten, a route can be reused, a repository can be swapped — but a trade
 * that says `demo` says it everywhere it is ever rendered.
 */
export type TradeOrigin = "demo" | "user";

export interface StoredTrade extends Trade {
  origin: TradeOrigin;
}

/**
 * Stable machine-readable reasons — EPIC 09 §9.
 *
 * The interface must tell a user what is wrong with their trade, in their own
 * language. Matching on an English sentence to find the translation would tie
 * every locale to the exact wording of a developer message, so the code is the
 * identity and `reason` stays a developer-facing string for logs and tests.
 */
export const issueCodes = [
  "required",
  "notANumber",
  "notRecognised",
  "notADateTime",
  "notAPositivePrice",
  "stopEqualsEntry",
  "longStopBelowEntry",
  "shortStopAboveEntry",
  "longTargetAboveEntry",
  "shortTargetBelowEntry",
  "riskPositive",
  "closedNeedsExit",
  "closedNeedsCloseTime",
  "exitOnlyWhenClosed",
  "closedBeforeOpened",
  "notYetClosed",
  "unknownConcept",
  "unknownSetup",
  "unknownAdherence",
  "emptyId",
  "duplicateId",
] as const;

export type IssueCode = (typeof issueCodes)[number];

export interface ValidationIssue {
  field: string;
  code: IssueCode;
  /** Developer-facing detail. Never rendered as the primary message. */
  reason: string;
}

/**
 * Validation returns issues rather than throwing.
 *
 * A malformed trade read back from storage must not take the application down;
 * the UI needs to show what is wrong with it. Throwing is right for a
 * developer error at module load, and wrong for user data.
 */
export function validateTrade(trade: Trade): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bad = (field: string, code: IssueCode, reason: string) =>
    issues.push({ field, code, reason });

  if (trade.id.trim() === "") bad("id", "emptyId", "empty");

  for (const [field, value] of [
    ["entry", trade.entry],
    ["stop", trade.stop],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      bad(field, "notAPositivePrice", "not a positive price");
    }
  }
  for (const [field, value] of [
    ["target", trade.target],
    ["exit", trade.exit],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      bad(field, "notAPositivePrice", "not a positive price");
    }
  }

  if (trade.entry === trade.stop) {
    bad("stop", "stopEqualsEntry", "stop equals entry, so risk is undefined");
  }
  // Direction and stop must agree, or every derived figure inverts silently.
  if (trade.direction === "long" && trade.stop > trade.entry) {
    bad("stop", "longStopBelowEntry", "a long stop must sit below entry");
  }
  if (trade.direction === "short" && trade.stop < trade.entry) {
    bad("stop", "shortStopAboveEntry", "a short stop must sit above entry");
  }

  // A target on the wrong side of entry is not a pessimistic plan, it is an
  // impossible one — it would make `plannedR` negative and quietly describe a
  // trade nobody would take. §9: reject the obviously impossible rather than
  // storing it and rendering nonsense downstream.
  if (trade.target !== undefined) {
    if (trade.direction === "long" && trade.target <= trade.entry) {
      bad("target", "longTargetAboveEntry", "a long target must sit above entry");
    }
    if (trade.direction === "short" && trade.target >= trade.entry) {
      bad("target", "shortTargetBelowEntry", "a short target must sit below entry");
    }
  }

  if (!Number.isFinite(trade.riskAmount) || trade.riskAmount <= 0) {
    bad("riskAmount", "riskPositive", "risk must be a positive amount");
  }

  if (trade.status === "closed" && trade.exit === undefined) {
    bad("exit", "closedNeedsExit", "a closed trade needs an exit price");
  }
  if (trade.status === "closed" && trade.closedAt === undefined) {
    bad("closedAt", "closedNeedsCloseTime", "a closed trade needs a close time");
  }
  if (trade.status !== "closed" && trade.exit !== undefined) {
    bad("exit", "exitOnlyWhenClosed", "only a closed trade has an exit");
  }

  const opened = Date.parse(trade.openedAt);
  if (Number.isNaN(opened)) bad("openedAt", "notADateTime", "not an ISO date");
  if (trade.closedAt !== undefined) {
    const closed = Date.parse(trade.closedAt);
    if (Number.isNaN(closed)) {
      bad("closedAt", "notADateTime", "not an ISO date");
    } else if (!Number.isNaN(opened) && closed < opened) {
      // Time does not run backwards, and `holdingMinutes` already returns null
      // for this case — storing it would mean a record whose duration can
      // never be computed.
      bad("closedAt", "closedBeforeOpened", "a trade cannot close before it opened");
    }
  }
  // `closedAt` is only meaningful once the position left the market. A planned
  // or open trade carrying one is a contradiction in the record itself.
  if ((trade.status === "planned" || trade.status === "open") && trade.closedAt !== undefined) {
    bad("closedAt", "notYetClosed", "a planned or open trade has not closed");
  }

  // Canonical references must resolve, or the knowledge layer has a hole.
  //
  // Guarded with `Array.isArray` rather than trusted from the type. This
  // function is deliberately pointed at untrusted input — a row read back from
  // `localStorage` that a previous version, another tab, or a corrupted write
  // produced — and a `for...of` over a missing field throws. Validation that
  // can crash on malformed data cannot be the thing that protects against it.
  if (!Array.isArray(trade.conceptIds)) {
    bad("conceptIds", "notRecognised", "conceptIds is not a list");
  } else {
    for (const id of trade.conceptIds) {
      if (typeof id !== "string" || !isTradingConceptId(id)) {
        bad("conceptIds", "unknownConcept", `unknown concept "${String(id)}"`);
      }
    }
  }
  if (trade.setupId !== undefined && getSetup(trade.setupId) === undefined) {
    bad("setupId", "unknownSetup", `unknown setup "${trade.setupId}"`);
  }

  if (trade.review !== undefined && trade.review !== null) {
    if (!Array.isArray(trade.review.conceptIds)) {
      bad("review.conceptIds", "notRecognised", "review conceptIds is not a list");
    } else {
      for (const id of trade.review.conceptIds) {
        if (typeof id !== "string" || !isTradingConceptId(id)) {
          bad("review.conceptIds", "unknownConcept", `unknown concept "${String(id)}"`);
        }
      }
    }
    if (!Array.isArray(trade.review.rules)) {
      bad("review.rules", "notRecognised", "review rules is not a list");
    } else {
      for (const rule of trade.review.rules) {
        if (rule === null || typeof rule !== "object" ||
            !adherenceStates.includes(rule.adherence)) {
          bad("review.rules", "unknownAdherence", `unknown adherence "${String(rule?.adherence)}"`);
        }
      }
    }
  }

  return issues;
}

export function isValidTrade(trade: Trade): boolean {
  return validateTrade(trade).length === 0;
}
