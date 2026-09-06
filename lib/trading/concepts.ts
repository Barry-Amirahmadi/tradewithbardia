/**
 * THE CANONICAL TRADING CONCEPT MODEL — master prompt §4, §6.
 *
 * One identity per idea, for the whole product.
 *
 * Before this file the vocabulary existed in three partial copies that agreed
 * with none of the others: the hero's nine beats (`hero-scene.ts`), the seven
 * process steps rendered by the old `Process` section, and the seven `systems`
 * children in the navigation tree. "Liquidity" was a beat id, a dictionary key
 * under `process.steps`, and a nav label key — three strings, no relationship,
 * and nothing stopping a fourth from appearing when the Dictionary is built.
 *
 * That is the failure mode §4 exists to prevent. From here a concept is
 * referenced, never redefined. The Setup Lab will tag a setup with
 * `"liquidity"`, the Dictionary will render the term for `"liquidity"`, the
 * Academy will teach `"liquidity"`, and search will return all three — because
 * they are the same string in the same union, checked by the compiler.
 *
 * WHAT LIVES HERE: identity, relationships, and which surface owns the full
 * treatment. WHAT DOES NOT: prose. Every human-readable word is a dictionary
 * key, because a concept model that carries English cannot be translated.
 */

/**
 * The nine stages of the system are concepts, not a parallel set of ids — a
 * stage IS the concept it teaches. The remaining entries are the mechanisms
 * those stages introduce, and they are what the Dictionary will expand first.
 */
export const tradingConceptIds = [
  // The system itself, in order.
  "market",
  "context",
  "liquidity",
  "structure",
  "setup",
  "execution",
  "risk",
  "review",
  "data",
  // Mechanisms named inside those stages.
  "equalHighs",
  "equalLows",
  "sweep",
  "bos",
  "mss",
  "displacement",
  "fvg",
  "entry",
  "invalidation",
  "positionSize",
] as const;

export type TradingConceptId = (typeof tradingConceptIds)[number];

/**
 * Which surface owns the full treatment of a concept. Declared rather than
 * inferred so a future epic can ask "what does the Dictionary need to cover?"
 * without reading nine components. Nothing here claims the surface exists yet.
 */
export type ConceptSurface =
  | "story"
  | "dictionary"
  | "academy"
  | "setupLab"
  | "journal";

export interface TradingConcept {
  id: TradingConceptId;
  /**
   * The concept this one lives inside — the knowledge-graph edge that makes
   * `market → liquidity → sweep` a tree rather than a flat list. Root concepts
   * have none.
   */
  parent?: TradingConceptId;
  /**
   * Latin abbreviation, kept verbatim in both locales. Persian trading
   * discourse writes MSS, BOS and FVG in Latin; translating them makes the
   * copy less natural, not more (§12).
   */
  abbr?: string;
  /** Sibling ideas worth reading next. Symmetry is asserted below. */
  related: readonly TradingConceptId[];
  /** What must be understood first. Must be acyclic; asserted below. */
  prerequisites: readonly TradingConceptId[];
  surfaces: readonly ConceptSurface[];
}

/**
 * `usedBy` and `children` are deliberately NOT stored. They are the inverse of
 * `prerequisites` and `parent`, and a stored inverse is a second copy that
 * drifts the first time someone edits one side. They are derived below.
 */
const conceptList: readonly TradingConcept[] = [
  {
    id: "market",
    related: ["context", "data"],
    prerequisites: [],
    surfaces: ["story", "academy"],
  },
  {
    id: "context",
    related: ["market", "liquidity"],
    prerequisites: ["market"],
    surfaces: ["story", "academy", "setupLab"],
  },
  {
    id: "liquidity",
    related: ["context", "structure"],
    prerequisites: ["market"],
    surfaces: ["story", "dictionary", "academy", "setupLab"],
  },
  {
    id: "structure",
    related: ["liquidity", "setup"],
    prerequisites: ["market"],
    surfaces: ["story", "dictionary", "academy", "setupLab"],
  },
  {
    id: "setup",
    related: ["structure", "execution"],
    prerequisites: ["context", "liquidity", "structure"],
    surfaces: ["story", "setupLab", "academy"],
  },
  {
    id: "execution",
    related: ["setup", "risk"],
    prerequisites: ["setup"],
    surfaces: ["story", "academy", "journal"],
  },
  {
    id: "risk",
    related: ["execution", "review"],
    prerequisites: ["execution"],
    surfaces: ["story", "academy", "journal"],
  },
  {
    id: "review",
    related: ["risk", "data"],
    prerequisites: ["execution"],
    surfaces: ["story", "journal"],
  },
  {
    id: "data",
    related: ["review", "market"],
    prerequisites: ["review"],
    surfaces: ["story", "journal", "setupLab"],
  },

  // ── Mechanisms ────────────────────────────────────────────────────────
  {
    id: "equalHighs",
    parent: "liquidity",
    related: ["equalLows", "sweep"],
    prerequisites: ["liquidity"],
    surfaces: ["dictionary", "academy"],
  },
  {
    id: "equalLows",
    parent: "liquidity",
    related: ["equalHighs", "sweep"],
    prerequisites: ["liquidity"],
    surfaces: ["dictionary", "academy"],
  },
  {
    id: "sweep",
    parent: "liquidity",
    related: ["equalHighs", "mss"],
    prerequisites: ["liquidity"],
    surfaces: ["story", "dictionary", "academy", "setupLab"],
  },
  {
    id: "bos",
    parent: "structure",
    abbr: "BOS",
    related: ["mss", "displacement"],
    prerequisites: ["structure"],
    surfaces: ["dictionary", "academy"],
  },
  {
    id: "mss",
    parent: "structure",
    abbr: "MSS",
    related: ["bos", "displacement", "sweep"],
    prerequisites: ["structure"],
    surfaces: ["story", "dictionary", "academy", "setupLab"],
  },
  {
    id: "displacement",
    parent: "structure",
    related: ["mss", "fvg"],
    prerequisites: ["structure"],
    surfaces: ["dictionary", "academy"],
  },
  {
    id: "fvg",
    parent: "setup",
    abbr: "FVG",
    related: ["displacement", "entry"],
    prerequisites: ["structure"],
    surfaces: ["story", "dictionary", "academy", "setupLab"],
  },
  {
    id: "entry",
    parent: "execution",
    related: ["fvg", "invalidation"],
    prerequisites: ["setup"],
    surfaces: ["story", "dictionary", "journal"],
  },
  {
    id: "invalidation",
    parent: "risk",
    related: ["entry", "positionSize"],
    prerequisites: ["execution"],
    surfaces: ["story", "dictionary", "academy", "journal"],
  },
  {
    id: "positionSize",
    parent: "risk",
    related: ["invalidation"],
    prerequisites: ["risk"],
    surfaces: ["dictionary", "academy", "journal"],
  },
];

const byId = new Map<TradingConceptId, TradingConcept>(
  conceptList.map((concept) => [concept.id, concept]),
);

/**
 * Integrity, checked at module load rather than by a test alone — a dangling
 * reference should stop the build, not wait for someone to run the suite. The
 * test suite asserts the same properties so the failure is legible either way.
 */
{
  const declared = new Set<string>(tradingConceptIds);

  for (const id of tradingConceptIds) {
    if (!byId.has(id)) {
      throw new Error(`concepts: "${id}" is declared but has no record.`);
    }
  }
  if (byId.size !== tradingConceptIds.length) {
    throw new Error("concepts: a record exists that is not in the id union.");
  }

  for (const concept of conceptList) {
    for (const [field, ids] of [
      ["related", concept.related],
      ["prerequisites", concept.prerequisites],
      ["parent", concept.parent === undefined ? [] : [concept.parent]],
    ] as const) {
      for (const ref of ids) {
        if (!declared.has(ref)) {
          throw new Error(
            `concepts: "${concept.id}".${field} points at "${ref}", which does not exist.`,
          );
        }
        if (ref === concept.id) {
          throw new Error(`concepts: "${concept.id}".${field} references itself.`);
        }
      }
    }
  }

  // Prerequisite cycles would make "what do I read first?" unanswerable and
  // would hang any future learning-path traversal.
  const state = new Map<TradingConceptId, "open" | "done">();
  const walk = (id: TradingConceptId, trail: TradingConceptId[]): void => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "open") {
      throw new Error(
        `concepts: prerequisite cycle ${[...trail, id].join(" → ")}.`,
      );
    }
    state.set(id, "open");
    for (const next of byId.get(id)?.prerequisites ?? []) {
      walk(next, [...trail, id]);
    }
    state.set(id, "done");
  };
  for (const id of tradingConceptIds) walk(id, []);
}

export const tradingConcepts: readonly TradingConcept[] = conceptList;

export function getConcept(id: TradingConceptId): TradingConcept {
  const concept = byId.get(id);
  if (concept === undefined) {
    // Unreachable while `id` is typed, but a runtime id from a URL or a stored
    // journal record is not typed, and returning undefined would push the
    // problem into a renderer.
    throw new Error(`concepts: unknown concept "${String(id)}".`);
  }
  return concept;
}

export function isTradingConceptId(value: string): value is TradingConceptId {
  return byId.has(value as TradingConceptId);
}

/** Derived: the inverse of `parent`. */
export function childrenOf(id: TradingConceptId): readonly TradingConceptId[] {
  return conceptList.filter((c) => c.parent === id).map((c) => c.id);
}

/** Derived: the inverse of `prerequisites` — "what does this unlock?" */
export function usedBy(id: TradingConceptId): readonly TradingConceptId[] {
  return conceptList
    .filter((c) => c.prerequisites.includes(id))
    .map((c) => c.id);
}

/** Concepts a given future surface is responsible for. */
export function conceptsForSurface(
  surface: ConceptSurface,
): readonly TradingConceptId[] {
  return conceptList
    .filter((c) => c.surfaces.includes(surface))
    .map((c) => c.id);
}
