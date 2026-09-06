import type { Dictionary } from "../i18n/dictionary-type";
import { lessons } from "../trading/lessons";
import { lazyProvider, type SearchIndexLoader } from "./lazy";
import { scoreMatch, type SearchProvider, type SearchResult } from "./provider";

/**
 * ACADEMY LESSONS AS SEARCH RESULTS — master prompt §22.
 *
 * The fourth provider. Registered exactly like the third, loaded exactly like
 * the third, and requiring no change to the palette — which is the property
 * the registry was built for and the reason the EPIC 04 payload defect is not
 * repeated here.
 *
 * Lessons are the largest prose in the product: eight lessons with four
 * teaching sections and three takeaways each, in two languages. None of it is
 * serialized into any route. The index loads on first search and the result
 * carries only what a result needs — id, title, route, and the concepts it
 * covers, which is what makes a lesson findable by the *concept* a reader is
 * actually looking for (§22).
 */

export interface AcademyIndex {
  academy: Dictionary["academy"];
  concepts: Dictionary["concepts"];
}

export function createAcademyProvider(
  load: SearchIndexLoader<AcademyIndex>,
): SearchProvider {
  return lazyProvider<AcademyIndex>("academy", load, ({ academy, concepts }, query, context) => {
    const results: SearchResult[] = [];

    for (const lesson of lessons) {
      const copy = academy.lessons[lesson.id as keyof typeof academy.lessons];
      if (copy === undefined) continue;

      // Title, summary, and the canonical concepts it teaches. Searching
      // "sweep" should find the liquidity lesson even though the word may not
      // appear in its title — that mapping is the point of one vocabulary.
      const conceptScore = Math.max(
        0,
        ...lesson.conceptIds.map((id) => scoreMatch(concepts[id].term, query) * 0.8),
      );
      const score = Math.max(
        scoreMatch(copy.title, query),
        scoreMatch(copy.summary, query) * 0.5,
        conceptScore,
      );
      if (score === 0) continue;

      results.push({
        id: `lesson.${lesson.slug}`,
        kind: "lesson",
        title: copy.title,
        subtitle: `${academy.eyebrow} · ${academy.levels[lesson.level]}`,
        href: `/${context.locale}/academy/${lesson.slug}`,
        // Above concept definitions, below setups and navigation: a reader
        // searching a concept usually wants to learn it before applying it,
        // but someone typing a section name still wants the section.
        score: score * 5,
      });
    }

    return results;
  });
}
