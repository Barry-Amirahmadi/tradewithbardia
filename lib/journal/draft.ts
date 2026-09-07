import { isTradingConceptId, type TradingConceptId } from "../trading/concepts";
import { getSetup } from "../trading/setups";
import { toMoney, toPrice } from "./money";
import {
  tradeDirections,
  tradeInstruments,
  tradeSessions,
  tradeStatuses,
  tradeTimeframes,
  validateTrade,
  type StoredTrade,
  type Trade,
  type TradeDirection,
  type TradeInstrument,
  type TradeOrigin,
  type TradeReview,
  type IssueCode,
  type TradeStatus,
  type ValidationIssue,
} from "./trade";

/**
 * THE FORM/DOMAIN BOUNDARY — master prompt §5, §6, §7, §8, §9, §10.
 *
 * A form holds strings. The domain holds integers, ISO timestamps and
 * canonical ids. This module is the only place those two meet, and it is a
 * pure function — no React, no DOM — so every parsing rule below is directly
 * testable rather than trapped inside a change handler.
 *
 * THE RULE THIS FILE EXISTS FOR (§9): **bad input never becomes valid-looking
 * data.** `Number("")` is `0`, `Number(" ")` is `0`, and `Number("1,5")` is
 * `NaN` — so a naive form would silently record a trade with a zero stop, or a
 * price of NaN that formats as "—" forever. Every conversion here is explicit
 * and refuses rather than coerces.
 *
 * WHAT IS NOT COLLECTED. There is no P&L field, no R field and no win/loss
 * selector, because §7 forbids asking for what the system can derive. A user
 * who could type a P&L could type one that disagrees with the prices beside
 * it, and then the journal is no longer evidence.
 */

/**
 * A trade as a form holds it: every field a string, nothing parsed yet.
 *
 * `""` means "not filled in" for optional fields. That is deliberately not
 * `undefined`: a controlled input needs a string, and mapping the empty case
 * at the boundary keeps every component free of null checks.
 */
export interface TradeDraft {
  status: TradeStatus;
  instrument: TradeInstrument;
  direction: TradeDirection;
  session: string;
  timeframe: string;
  setupId: string;
  conceptIds: readonly TradingConceptId[];
  entry: string;
  stop: string;
  target: string;
  exit: string;
  riskAmount: string;
  openedAt: string;
  closedAt: string;
  notes: string;
}

/**
 * §8 stated as data rather than prose, so the form can mark required fields
 * from the same list the parser enforces. Two copies of this would drift.
 */
export const requiredDraftFields = [
  "instrument",
  "direction",
  "entry",
  "stop",
  "riskAmount",
  "openedAt",
] as const;

/** Required only once the trade has actually closed. */
export const requiredWhenClosed = ["exit", "closedAt"] as const;

/**
 * Strict decimal. No exponent, no thousands separator, no leading `+`.
 *
 * Exponent notation is rejected on purpose: someone typing `1e5` into a price
 * field is far more likely to have fumbled a key than to mean 100 000, and
 * accepting it would turn a typo into a plausible-looking record.
 */
const DECIMAL = /^-?\d+(?:\.\d+)?$/;

/** `datetime-local` produces `YYYY-MM-DDTHH:mm`, sometimes with seconds. */
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "" || !DECIMAL.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Wall-clock input to a canonical instant — §31.
 *
 * **The entered time is read as UTC**, and `formatDate` displays UTC. That
 * pairing is the whole decision: a record entered as 14:30 reads back as
 * 14:30, everywhere, and the round-trip is lossless.
 *
 * The alternative — `new Date("2026-09-07T14:30")`, which JavaScript reads as
 * *local* time — would store 11:00Z for a trader in Tehran and then display
 * "11:00", silently moving every timestamp the user typed. A journal that
 * changes the times you entered is worse than one that admits it does not know
 * your timezone.
 *
 * The limitation this leaves is real and documented: until the journal collects
 * a timezone, "14:30" means 14:30 UTC rather than 14:30 where the trader sits.
 * Fixing that is a settings field and a formatter argument, not a redesign —
 * which is exactly why no timezone assumption is baked in here.
 */
export function draftTimeToIso(value: string): string | null {
  const match = LOCAL_DATETIME.exec(value.trim());
  if (match === null) return null;
  const [, y, mo, d, h, mi, s] = match;
  const time = Date.UTC(
    Number(y), Number(mo) - 1, Number(d),
    Number(h), Number(mi), s === undefined ? 0 : Number(s),
  );
  if (Number.isNaN(time)) return null;
  const iso = new Date(time).toISOString();
  // Round-trip check: `Date.UTC(2026, 1, 30)` silently becomes 2 March rather
  // than failing, so an impossible calendar date is caught by comparing what
  // came back against what was typed.
  return iso.slice(0, 16) === `${y}-${mo}-${d}T${h}:${mi}` ? iso : null;
}

/** The inverse, for loading a saved trade back into the form. */
export function isoToDraftTime(iso: string | undefined): string {
  if (iso === undefined) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time).toISOString().slice(0, 16);
}

export function emptyDraft(now: Date = new Date()): TradeDraft {
  return {
    status: "planned",
    instrument: "indices",
    direction: "long",
    session: "",
    timeframe: "",
    setupId: "",
    conceptIds: [],
    entry: "",
    stop: "",
    target: "",
    exit: "",
    riskAmount: "",
    openedAt: isoToDraftTime(now.toISOString()),
    closedAt: "",
    notes: "",
  };
}

/** Load a stored record back into form strings. The inverse of `parseDraft`. */
export function draftFromTrade(trade: Trade): TradeDraft {
  const price = (value: number | undefined): string =>
    value === undefined ? "" : String(value / 100_000);

  return {
    status: trade.status,
    instrument: trade.instrument,
    direction: trade.direction,
    session: trade.session ?? "",
    timeframe: trade.timeframe ?? "",
    setupId: trade.setupId ?? "",
    conceptIds: [...trade.conceptIds],
    entry: price(trade.entry),
    stop: price(trade.stop),
    target: price(trade.target),
    exit: price(trade.exit),
    riskAmount: String(trade.riskAmount / 100),
    openedAt: isoToDraftTime(trade.openedAt),
    closedAt: isoToDraftTime(trade.closedAt),
    notes: trade.notes ?? "",
  };
}

export type DraftResult =
  | { ok: true; trade: StoredTrade }
  | { ok: false; issues: readonly ValidationIssue[] };

interface DraftMeta {
  id: string;
  origin: TradeOrigin;
  /** Preserved across an edit — editing prices must not discard a review. */
  review?: TradeReview;
}

/**
 * Parse a draft into a storable trade, or report everything wrong with it.
 *
 * All parse issues are collected before returning, never the first one only:
 * a form that reveals one error per submission is a form people abandon.
 *
 * Two passes, in order. First this function's own concern — is each string a
 * well-formed value of the right kind. Then `validateTrade`, the same domain
 * rules the repository enforces on every write, so a trade created through
 * this form and a trade created by any future importer are held to identical
 * standards (§6). There is exactly one definition of a valid trade.
 */
export function parseDraft(draft: TradeDraft, meta: DraftMeta): DraftResult {
  const issues: ValidationIssue[] = [];
  const bad = (field: string, code: IssueCode, reason: string) =>
    issues.push({ field, code, reason });

  const enumField = <T extends string>(
    field: string,
    value: string,
    allowed: readonly T[],
  ): T | undefined => {
    if (value === "") return undefined;
    if (!(allowed as readonly string[]).includes(value)) {
      bad(field, "notRecognised", "not a recognised value");
      return undefined;
    }
    return value as T;
  };

  const requiredPrice = (field: string, raw: string): number | undefined => {
    if (raw.trim() === "") {
      bad(field, "required", "required");
      return undefined;
    }
    const value = parseDecimal(raw);
    if (value === null) {
      bad(field, "notANumber", "not a number");
      return undefined;
    }
    return toPrice(value);
  };

  const optionalPrice = (field: string, raw: string): number | undefined => {
    if (raw.trim() === "") return undefined;
    const value = parseDecimal(raw);
    if (value === null) {
      bad(field, "notANumber", "not a number");
      return undefined;
    }
    return toPrice(value);
  };

  const status = enumField("status", draft.status, tradeStatuses) ?? "planned";
  const instrument = enumField("instrument", draft.instrument, tradeInstruments);
  const direction = enumField("direction", draft.direction, tradeDirections);
  // Evaluated once. Calling `enumField` again inside the object literal below
  // would report the same bad value twice.
  const session = enumField("session", draft.session, tradeSessions);
  const timeframe = enumField("timeframe", draft.timeframe, tradeTimeframes);
  if (instrument === undefined) bad("instrument", "required", "required");
  if (direction === undefined) bad("direction", "required", "required");

  const entry = requiredPrice("entry", draft.entry);
  const stop = requiredPrice("stop", draft.stop);
  const target = optionalPrice("target", draft.target);
  const exit = optionalPrice("exit", draft.exit);

  let riskAmount: number | undefined;
  if (draft.riskAmount.trim() === "") {
    bad("riskAmount", "required", "required");
  } else {
    const value = parseDecimal(draft.riskAmount);
    if (value === null) bad("riskAmount", "notANumber", "not a number");
    else riskAmount = toMoney(value);
  }

  const openedAt = draftTimeToIso(draft.openedAt);
  if (draft.openedAt.trim() === "") bad("openedAt", "required", "required");
  else if (openedAt === null) bad("openedAt", "notADateTime", "not a valid date and time");

  let closedAt: string | undefined;
  if (draft.closedAt.trim() !== "") {
    const parsed = draftTimeToIso(draft.closedAt);
    if (parsed === null) bad("closedAt", "notADateTime", "not a valid date and time");
    else closedAt = parsed;
  }

  // Canonical references are checked here as well as in `validateTrade` so the
  // form can point at the offending field; the domain check is the guarantee.
  const setupId = draft.setupId === "" ? undefined : draft.setupId;
  if (setupId !== undefined && getSetup(setupId) === undefined) {
    bad("setupId", "unknownSetup", "not a known setup");
  }
  const conceptIds = draft.conceptIds.filter((id) => {
    if (isTradingConceptId(id)) return true;
    bad("conceptIds", "unknownConcept", `not a known concept: ${id}`);
    return false;
  });

  if (issues.length > 0) return { ok: false, issues };
  // Every required value is present once the parse pass is clean; the
  // assertions below are narrowing, not assumptions.
  if (
    instrument === undefined || direction === undefined ||
    entry === undefined || stop === undefined ||
    riskAmount === undefined || openedAt === null
  ) {
    return { ok: false, issues: [{ field: "form", code: "required", reason: "incomplete" }] };
  }

  const trade: StoredTrade = {
    id: meta.id,
    origin: meta.origin,
    status,
    instrument,
    direction,
    ...(session !== undefined ? { session } : {}),
    ...(timeframe !== undefined ? { timeframe } : {}),
    ...(setupId !== undefined ? { setupId } : {}),
    conceptIds,
    entry,
    stop,
    ...(target !== undefined ? { target } : {}),
    ...(exit !== undefined ? { exit } : {}),
    riskAmount,
    openedAt,
    ...(closedAt !== undefined ? { closedAt } : {}),
    ...(draft.notes.trim() !== "" ? { notes: draft.notes.trim() } : {}),
    ...(meta.review !== undefined ? { review: meta.review } : {}),
  };

  const domainIssues = validateTrade(trade);
  if (domainIssues.length > 0) return { ok: false, issues: domainIssues };

  return { ok: true, trade };
}

/**
 * A new record id.
 *
 * Time-ordered prefix so records sort chronologically in storage, plus random
 * suffix so two trades captured in the same millisecond cannot collide. Not a
 * UUID: this is a local key, `crypto.randomUUID` is unavailable on insecure
 * origins, and a dependency for 16 bytes of randomness is not justified (§54).
 */
export function newTradeId(now: Date = new Date(), random: () => number = Math.random): string {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0");
  return `t${stamp}${suffix}`;
}
