import {
  getConcept,
  tradingConceptIds,
  type TradingConceptId,
} from "./concepts";
import { lessonForConcept, type Lesson } from "./lessons";
import { setupsForConcept, type Setup } from "./setups";
import { systemStageIds, type SystemStageId } from "./system-stages";

/**
 * THE DICTIONARY — master prompt §3, §4, §5, §15, §24.
 *
 * A **surface over `TradingConcept`**, not a second registry. There is no
 * `DictionaryConcept`, no `GlossaryTerm` and no independent primary key: an
 * entry is addressed by `conceptId`, which is the same string the Trading
 * System Story highlights, the Setup Lab tags a setup with, the Academy
 * teaches, and search returns. That is the whole point of the epic — one
 * language across the product — and it is enforced by the type system rather
 * than by convention.
 *
 * WHAT THIS FILE OWNS: which concepts are published, what category each sits
 * in, and what someone might type to find it.
 *
 * WHAT IT DOES NOT OWN:
 *
 * - **Prose.** Titles and definitions live in the locale dictionaries, keyed
 *   by concept id. A content model holding English cannot be translated.
 * - **Relationships.** `related`, `prerequisites` and `parent` come from
 *   `concepts.ts`; lessons from `lessonForConcept()`; setups from
 *   `setupsForConcept()`. No edge is restated here, because a second copy of a
 *   graph is a second copy that drifts (§27).
 */

/**
 * Editorial state. Only `published` reaches a reader, so a half-written entry
 * can sit in the repository without appearing on the site or in search — the
 * seam a future CMS writes to without touching application code (§28).
 */
export type EntryStatus = "draft" | "review" | "published" | "deprecated";

/**
 * Categories are data, never a list inside a component (§6). They are
 * declared per entry and the set of categories is derived from the entries,
 * so adding a concept in a new category makes the category appear on its own.
 */
export type ConceptCategory =
  | "market"
  | "liquidity"
  | "structure"
  | "setup"
  | "execution"
  | "risk"
  | "review";

export interface DictionaryEntry {
  /** THE identity. There is deliberately no separate primary key. */
  conceptId: TradingConceptId;
  category: ConceptCategory;
  /**
   * Extra strings a reader might type. The concept's own term and its
   * `abbr` are searched automatically, so this holds only what neither
   * covers: expansions, common spellings, and shorthand.
   */
  aliases: readonly string[];
  status: EntryStatus;
}

const entries: readonly DictionaryEntry[] = [
  { conceptId: "market", category: "market", aliases: [], status: "published" },
  { conceptId: "context", category: "market", aliases: ["market context", "bias"], status: "published" },

  { conceptId: "liquidity", category: "liquidity", aliases: ["liq", "resting orders"], status: "published" },
  { conceptId: "equalHighs", category: "liquidity", aliases: ["eqh", "double top"], status: "published" },
  { conceptId: "equalLows", category: "liquidity", aliases: ["eql", "double bottom"], status: "published" },
  { conceptId: "sweep", category: "liquidity", aliases: ["liquidity sweep", "stop run", "raid"], status: "published" },

  { conceptId: "structure", category: "structure", aliases: ["market structure", "swing structure"], status: "published" },
  { conceptId: "bos", category: "structure", aliases: ["break of structure"], status: "published" },
  { conceptId: "mss", category: "structure", aliases: ["market structure shift", "change of character", "choch"], status: "published" },
  { conceptId: "displacement", category: "structure", aliases: ["impulse", "expansion"], status: "published" },

  { conceptId: "setup", category: "setup", aliases: ["trade setup", "specification"], status: "published" },
  { conceptId: "fvg", category: "setup", aliases: ["fair value gap", "imbalance", "inefficiency"], status: "published" },

  { conceptId: "execution", category: "execution", aliases: ["trade execution"], status: "published" },
  { conceptId: "entry", category: "execution", aliases: ["entry price", "trigger"], status: "published" },

  { conceptId: "risk", category: "risk", aliases: ["risk management"], status: "published" },
  { conceptId: "invalidation", category: "risk", aliases: ["stop", "stop loss", "invalidation level"], status: "published" },
  { conceptId: "positionSize", category: "risk", aliases: ["position sizing", "size", "lot size"], status: "published" },

  { conceptId: "review", category: "review", aliases: ["trade review", "journaling"], status: "published" },
  { conceptId: "data", category: "review", aliases: ["sample", "records", "statistics"], status: "published" },
];

// ── Integrity, at module load ─────────────────────────────────────────────
{
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.conceptId)) {
      throw new Error(`dictionary: duplicate entry for "${entry.conceptId}".`);
    }
    seen.add(entry.conceptId);
    // Throws if the concept does not exist. The Dictionary cannot define a
    // term the canonical registry has never heard of.
    getConcept(entry.conceptId);
  }
  for (const id of tradingConceptIds) {
    if (!seen.has(id)) {
      throw new Error(`dictionary: canonical concept "${id}" has no entry.`);
    }
  }
}

export const dictionaryEntries: readonly DictionaryEntry[] = entries;

/** Only published entries are reachable. Drafts exist but never render. */
export const publishedEntries: readonly DictionaryEntry[] = entries.filter(
  (entry) => entry.status === "published",
);

const byConcept = new Map(entries.map((entry) => [entry.conceptId, entry]));

export function getEntry(conceptId: TradingConceptId): DictionaryEntry | undefined {
  const entry = byConcept.get(conceptId);
  return entry?.status === "published" ? entry : undefined;
}

/**
 * SLUG ≠ IDENTITY — §24.
 *
 * The URL is a presentation concern; `conceptId` is the identity. They happen
 * to coincide for most concepts today because the ids are already readable,
 * but they are resolved through these two functions so that adding a localized
 * or renamed slug later is a change here and nowhere else. No component builds
 * a dictionary URL by hand.
 *
 * One canonical slug per concept, and therefore one canonical route per
 * localized concept — no `/dictionary/liquidity` competing with
 * `/dictionary/what-is-liquidity`.
 */
export function slugForConcept(conceptId: TradingConceptId): string {
  // camelCase ids become kebab-case paths: `equalHighs` → `equal-highs`.
  return conceptId.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

const bySlug = new Map(
  publishedEntries.map((entry) => [slugForConcept(entry.conceptId), entry]),
);

export function conceptForSlug(slug: string): TradingConceptId | undefined {
  return bySlug.get(slug)?.conceptId;
}

export function dictionaryHref(locale: string, conceptId: TradingConceptId): string {
  return `/${locale}/dictionary/${slugForConcept(conceptId)}`;
}

/** Categories present in the published set, in declaration order. */
export function categories(): readonly { id: ConceptCategory; count: number }[] {
  const counts = new Map<ConceptCategory, number>();
  for (const entry of publishedEntries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id, count]) => ({ id, count }));
}

export function entriesInCategory(
  category: ConceptCategory,
): readonly DictionaryEntry[] {
  return publishedEntries.filter((entry) => entry.category === category);
}

/**
 * Everything a term page can show, derived from the canonical graph.
 *
 * Each field is either present with real content or absent — §16 forbids
 * inventing related content to fill space, so an empty relationship is
 * returned empty and the page renders nothing for it.
 */
export interface ConceptContext {
  entry: DictionaryEntry;
  related: readonly TradingConceptId[];
  prerequisites: readonly TradingConceptId[];
  /** Concepts this one contains, e.g. liquidity → equal highs, sweep. */
  children: readonly TradingConceptId[];
  /** The Trading System stage it belongs to, if any. */
  stage: SystemStageId | undefined;
  lesson: Lesson | undefined;
  setups: readonly Setup[];
}

const stageSet = new Set<string>(systemStageIds);

export function conceptContext(
  conceptId: TradingConceptId,
): ConceptContext | undefined {
  const entry = getEntry(conceptId);
  if (entry === undefined) return undefined;

  const concept = getConcept(conceptId);
  const published = (id: TradingConceptId) => getEntry(id) !== undefined;

  // A concept is its own stage when it is one; otherwise its parent may be.
  const stage = stageSet.has(conceptId)
    ? (conceptId as SystemStageId)
    : concept.parent !== undefined && stageSet.has(concept.parent)
      ? (concept.parent as SystemStageId)
      : undefined;

  return {
    entry,
    related: concept.related.filter(published),
    prerequisites: concept.prerequisites.filter(published),
    children: dictionaryEntries
      .filter((e) => getConcept(e.conceptId).parent === conceptId)
      .map((e) => e.conceptId)
      .filter(published),
    stage,
    lesson: lessonForConcept(conceptId),
    setups: setupsForConcept(conceptId),
  };
}
