import { isTradingConceptId, type TradingConceptId } from "./concepts";

/**
 * THE SETUP MODEL — master prompt §4, §5, §12, §14.
 *
 * A setup is a written hypothesis, not a signal and not a result. The model
 * enforces that in three ways:
 *
 * 1. **Concepts are referenced, never copied.** `conceptIds` holds canonical
 *    `TradingConceptId` values from EPIC 04. A setup cannot invent its own
 *    notion of liquidity, and a reference to a concept that does not exist
 *    fails at module load.
 * 2. **Evidence is a required field with no default.** Every setup states what
 *    is known about it. Nothing here can be rendered without declaring whether
 *    it has been tested, which makes an impressive-looking fake statistics
 *    panel structurally impossible rather than merely discouraged (§5).
 * 3. **No prose.** Copy lives in the dictionary keyed by setup id, so a setup
 *    is the same object in both languages and a third locale is a file, not a
 *    refactor.
 *
 * Filter dimensions are DERIVED from this data (§14). Nothing in the UI
 * hardcodes an instrument or a session, so adding a setup with a new session
 * makes the filter appear on its own — and removing the last setup that uses
 * one makes it disappear rather than leaving a filter that matches nothing.
 */

/**
 * What is actually known about a setup. There is deliberately no `verified`
 * entry in use anywhere: as of this epic the underlying research has written
 * specifications and zero completed backtests, and PROJECT_RULES §1 forbids
 * claiming otherwise.
 */
export type SetupEvidence =
  /** A written specification. Reasoned, never tested. */
  | { kind: "conceptual" }
  /** Placeholder numbers standing in for a source that is not connected. */
  | { kind: "demo" }
  /** Tested, but below the minimum sample for any claim to be made. */
  | { kind: "insufficient"; sampleSize: number }
  /** Reconciled and sample-checked. Nothing qualifies yet. */
  | { kind: "verified"; sampleSize: number };

export type SetupDifficulty = "foundation" | "intermediate" | "advanced";
export type SetupSession = "asia" | "london" | "newYork";
export type SetupInstrument = "indices" | "metals" | "forex";
export type SetupTimeframe = "m1" | "m5" | "m15" | "h1" | "h4";

/**
 * The nine sections of a setup specification, in the order EPIC 05 §8 asks
 * them to be communicated. Declared as data so the detail page renders a loop
 * rather than nine hand-written blocks, and so a missing section in either
 * language is a test failure.
 */
export const setupSections = [
  "context",
  "liquidity",
  "structure",
  "trigger",
  "entry",
  "invalidation",
  "risk",
  "review",
] as const;

export type SetupSection = (typeof setupSections)[number];

export interface Setup {
  id: string;
  slug: string;
  /** Canonical concepts this setup is built from. Never setup-local copies. */
  conceptIds: readonly TradingConceptId[];
  /** Concepts a reader should understand first. Also canonical ids. */
  prerequisites: readonly TradingConceptId[];
  instruments: readonly SetupInstrument[];
  sessions: readonly SetupSession[];
  timeframes: readonly SetupTimeframe[];
  difficulty: SetupDifficulty;
  evidence: SetupEvidence;
  /**
   * A tiny shape descriptor for the card preview — five to seven normalized
   * points, drawn as a polyline. Deliberately NOT a `TradingScene`: rendering
   * twenty full scenes server-side would put roughly 470 kB of SVG in one
   * document, and a card does not need a readable chart, it needs a glyph that
   * distinguishes one setup's shape from another at a glance (§7).
   */
  preview: readonly (readonly [number, number])[];
}

const list: readonly Setup[] = [
  {
    id: "liquidity-sweep-reversal",
    slug: "liquidity-sweep-reversal",
    conceptIds: ["liquidity", "sweep", "structure", "mss", "fvg", "entry", "invalidation"],
    prerequisites: ["liquidity", "structure"],
    instruments: ["metals", "indices"],
    sessions: ["london", "newYork"],
    timeframes: ["m5", "m15"],
    difficulty: "intermediate",
    evidence: { kind: "conceptual" },
    preview: [[0, 0.55], [0.2, 0.42], [0.38, 0.2], [0.46, 0.06], [0.56, 0.44], [0.78, 0.72], [1, 0.9]],
  },
  {
    id: "session-open-displacement",
    slug: "session-open-displacement",
    conceptIds: ["context", "displacement", "fvg", "entry", "invalidation"],
    prerequisites: ["structure", "context"],
    instruments: ["indices"],
    sessions: ["newYork"],
    timeframes: ["m1", "m5"],
    difficulty: "advanced",
    evidence: { kind: "conceptual" },
    preview: [[0, 0.5], [0.24, 0.52], [0.4, 0.48], [0.52, 0.88], [0.7, 0.7], [0.86, 0.82], [1, 0.95]],
  },
  {
    id: "equal-highs-draw",
    slug: "equal-highs-draw",
    conceptIds: ["liquidity", "equalHighs", "context", "entry"],
    prerequisites: ["market", "liquidity"],
    instruments: ["forex"],
    sessions: ["london"],
    timeframes: ["m15", "h1"],
    difficulty: "foundation",
    evidence: { kind: "conceptual" },
    preview: [[0, 0.7], [0.22, 0.3], [0.42, 0.66], [0.6, 0.28], [0.78, 0.62], [1, 0.14]],
  },
  {
    id: "structure-shift-continuation",
    slug: "structure-shift-continuation",
    conceptIds: ["structure", "bos", "displacement", "entry", "positionSize"],
    prerequisites: ["structure"],
    instruments: ["forex", "indices"],
    sessions: ["london", "newYork"],
    timeframes: ["m15", "h1"],
    difficulty: "intermediate",
    evidence: { kind: "conceptual" },
    preview: [[0, 0.85], [0.18, 0.66], [0.34, 0.74], [0.52, 0.44], [0.68, 0.54], [0.84, 0.26], [1, 0.12]],
  },
  {
    id: "range-to-expansion",
    slug: "range-to-expansion",
    conceptIds: ["context", "market", "liquidity", "displacement", "invalidation", "positionSize"],
    prerequisites: ["market", "context"],
    instruments: ["metals"],
    sessions: ["asia", "london"],
    timeframes: ["h1", "h4"],
    difficulty: "advanced",
    evidence: { kind: "conceptual" },
    preview: [[0, 0.5], [0.16, 0.44], [0.32, 0.54], [0.48, 0.46], [0.62, 0.52], [0.8, 0.2], [1, 0.08]],
  },
];

// Integrity at module load. A setup referencing a concept that was renamed
// should stop the build, not render an empty tag three screens deep.
{
  const slugs = new Set<string>();
  for (const setup of list) {
    if (slugs.has(setup.slug)) {
      throw new Error(`setups: duplicate slug "${setup.slug}".`);
    }
    slugs.add(setup.slug);

    for (const [field, ids] of [
      ["conceptIds", setup.conceptIds],
      ["prerequisites", setup.prerequisites],
    ] as const) {
      for (const id of ids) {
        if (!isTradingConceptId(id)) {
          throw new Error(
            `setups: "${setup.id}".${field} references unknown concept "${id}".`,
          );
        }
      }
    }

    if (setup.conceptIds.length === 0) {
      throw new Error(`setups: "${setup.id}" references no concepts.`);
    }
    if (setup.preview.length < 3) {
      throw new Error(`setups: "${setup.id}" has no usable preview shape.`);
    }
  }
}

export const setups: readonly Setup[] = list;

const bySlug = new Map(list.map((setup) => [setup.slug, setup]));

export function getSetup(slug: string): Setup | undefined {
  return bySlug.get(slug);
}

/**
 * FILTER DIMENSIONS, DERIVED — §14.
 *
 * The UI asks the data what it can be filtered by. A dimension with fewer than
 * two distinct values is omitted: a filter that every setup matches is not a
 * filter, it is a label that takes up space and implies a choice that does not
 * exist.
 */
export interface FilterDimension<T extends string = string> {
  id: "instrument" | "session" | "timeframe" | "difficulty" | "concept";
  values: readonly { value: T; count: number }[];
}

function tally<T extends string>(
  rows: readonly (readonly T[])[],
): { value: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const row of rows) {
    for (const value of row) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function filterDimensions(
  source: readonly Setup[] = setups,
): readonly FilterDimension[] {
  const dimensions: FilterDimension[] = [
    { id: "instrument", values: tally(source.map((s) => s.instruments)) },
    { id: "session", values: tally(source.map((s) => s.sessions)) },
    { id: "timeframe", values: tally(source.map((s) => s.timeframes)) },
    { id: "difficulty", values: tally(source.map((s) => [s.difficulty])) },
    { id: "concept", values: tally(source.map((s) => s.conceptIds)) },
  ];
  return dimensions.filter((dimension) => dimension.values.length > 1);
}

export interface SetupQuery {
  instrument?: string;
  session?: string;
  timeframe?: string;
  difficulty?: string;
  concept?: string;
}

/** Pure, so the same filtering runs on the server and in a test. */
export function filterSetups(
  query: SetupQuery,
  source: readonly Setup[] = setups,
): readonly Setup[] {
  return source.filter((setup) => {
    if (query.instrument !== undefined && !setup.instruments.includes(query.instrument as SetupInstrument)) return false;
    if (query.session !== undefined && !setup.sessions.includes(query.session as SetupSession)) return false;
    if (query.timeframe !== undefined && !setup.timeframes.includes(query.timeframe as SetupTimeframe)) return false;
    if (query.difficulty !== undefined && setup.difficulty !== query.difficulty) return false;
    if (query.concept !== undefined && !setup.conceptIds.includes(query.concept as TradingConceptId)) return false;
    return true;
  });
}

/** Setups that teach a given concept — the reverse edge the Dictionary wants. */
export function setupsForConcept(id: TradingConceptId): readonly Setup[] {
  return list.filter((setup) => setup.conceptIds.includes(id));
}
