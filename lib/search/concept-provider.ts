import type { Dictionary } from "../i18n/dictionary-type";
import { getConcept, tradingConceptIds } from "../trading/concepts";
import { lazyProvider, type SearchIndexLoader } from "./lazy";
import { systemStageIds, type SystemStageId } from "../trading/system-stages";
import { scoreMatch, type SearchProvider, type SearchResult } from "./provider";

/**
 * TRADING CONCEPTS AS SEARCH RESULTS — master prompt §19.
 *
 * The second provider to register, and the one that proves the EPIC 02
 * registry does what it claimed: a whole content domain becomes searchable by
 * adding a file, with no change to the command palette.
 *
 * Result ids are canonical concept ids, prefixed. When the Dictionary lands it
 * will return richer results for the same ids rather than a parallel set, and
 * a future AI layer asking "what does the product know about liquidity?" gets
 * one answer instead of three.
 *
 * Honesty rule, same as the navigation provider: only what exists is indexed.
 * There is no Dictionary yet, so a concept links to the place it is actually
 * explained — its stage in the Trading System Story — and nothing pretends
 * there is a term page waiting.
 */

const stageIds = new Set<string>(systemStageIds);

/** Where a concept is currently explained, or null if nowhere yet. */
function anchorFor(id: string, locale: string): string | undefined {
  // The canonical home of the story is /systems as of EPIC 05 §22.
  if (stageIds.has(id)) return `/${locale}/systems#system-${id}`;
  const parent = getConcept(id as never).parent;
  // A mechanism is explained inside its parent stage; a parent that is not
  // itself a stage has no page yet, and gets no link rather than a wrong one.
  if (parent !== undefined && stageIds.has(parent)) {
    return `/${locale}/systems#system-${parent}`;
  }
  return undefined;
}

/** The copy this provider indexes. Loaded on first search, never sooner. */
export interface ConceptIndex {
  concepts: Dictionary["concepts"];
  system: Dictionary["system"];
}

export function createConceptProvider(
  load: SearchIndexLoader<ConceptIndex>,
): SearchProvider {
  return lazyProvider<ConceptIndex>("concepts", load, ({ concepts, system }, query, context) => {
      const results: SearchResult[] = [];

      for (const id of tradingConceptIds) {
        const copy = concepts[id];
        const concept = getConcept(id);

        // Match the term, and the Latin abbreviation where one exists — a
        // reader typing "MSS" in Persian copy should find it.
        const score = Math.max(
          scoreMatch(copy.term, query),
          concept.abbr === undefined ? 0 : scoreMatch(concept.abbr, query),
        );
        if (score === 0) continue;

        const isStage = stageIds.has(id);
        results.push({
          id: `concept.${id}`,
          kind: "term",
          title: concept.abbr === undefined ? copy.term : `${copy.term} · ${concept.abbr}`,
          subtitle: isStage
            ? system.eyebrow
            : system.stages[concept.parent as SystemStageId]?.label ?? system.eyebrow,
          href: anchorFor(id, context.locale),
          // Below navigation destinations, above nothing: a concept is a
          // definition, and someone typing a section name wants the section.
          score: score * 4,
        });
      }

      return results;
    },
  );
}
