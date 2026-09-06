import type { Dictionary } from "../i18n/dictionary-type";
import { getConcept } from "../trading/concepts";
import { dictionaryHref, publishedEntries } from "../trading/dictionary";
import { lazyProvider, type SearchIndexLoader } from "./lazy";
import { normalise, scoreMatch, type SearchProvider, type SearchResult } from "./provider";

/**
 * THE DICTIONARY PROVIDER — master prompt §11, §12, §34.
 *
 * The fifth provider. Registered like the fourth, loaded like the fourth, and
 * requiring no change to the palette or to the other providers — which is the
 * answer to §34's audit question: the architecture is sufficient and is left
 * alone.
 *
 * WHAT IS INDEXED is deliberately narrow (§11): the term, the abbreviation,
 * the aliases, and the canonical concept id. **Definitions are not searched.**
 * That is not an oversight — matching full definition prose would return a
 * concept for any word in any paragraph, which is recall without precision,
 * and it would mean shipping every definition into the search index. Full
 * content loads when the reader opens the entry.
 *
 * Search works across scripts because a Persian reader looks up `MSS` in Latin
 * and `نقدینگی` in Persian, often in the same session. Both resolve to the
 * same canonical id.
 */

export interface DictionaryIndex {
  concepts: Dictionary["concepts"];
  dict: Dictionary["dict"];
}

export function createDictionaryProvider(
  load: SearchIndexLoader<DictionaryIndex>,
): SearchProvider {
  return lazyProvider<DictionaryIndex>("dictionary", load, ({ concepts, dict }, query, context) => {
    const results: SearchResult[] = [];
    const needle = normalise(query);

    for (const entry of publishedEntries) {
      const concept = getConcept(entry.conceptId);
      const copy = concepts[entry.conceptId];

      // The localized term, the Latin abbreviation, every alias, and the
      // canonical id itself — someone who knows the codebase can type
      // `positionSize` and find it.
      const candidates = [
        copy.term,
        concept.abbr ?? "",
        entry.conceptId,
        ...entry.aliases,
      ].filter((value) => value.length > 0);

      let score = 0;
      for (const candidate of candidates) {
        score = Math.max(score, scoreMatch(candidate, query));
      }
      // An exact alias or abbreviation match should outrank a prefix match on
      // a longer term: someone typing "FVG" wants the fair value gap first.
      if (candidates.some((c) => normalise(c) === needle)) score = 4;
      if (score === 0) continue;

      results.push({
        id: `dict.${entry.conceptId}`,
        kind: "term",
        title: concept.abbr === undefined ? copy.term : `${copy.term} · ${concept.abbr}`,
        subtitle: `${dict.eyebrow} · ${dict.categories[entry.category]}`,
        href: dictionaryHref(context.locale, entry.conceptId),
        // Below setups and lessons: a definition is what you want when the
        // page you were looking for is not the answer.
        score: score * 4,
      });
    }

    return results;
  });
}
