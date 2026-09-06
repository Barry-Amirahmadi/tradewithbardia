import type { Dictionary } from "../i18n/dictionary-type";
import { setups } from "../trading/setups";
import { lazyProvider, type SearchIndexLoader } from "./lazy";
import { scoreMatch, type SearchProvider, type SearchResult } from "./provider";

/**
 * SETUPS AS SEARCH RESULTS — master prompt §13.
 *
 * The third provider, and the one that tests whether the registry actually
 * scales: it was added without touching the palette, the other providers, or
 * the merge logic.
 *
 * Loaded lazily. The setup copy is the largest content block in the product —
 * five specifications with ten prose fields each, in two languages — and
 * eagerly indexing it would put the entire library into every route's payload,
 * which is precisely the EPIC 04 defect this epic was told not to repeat.
 *
 * Result ids are `setup.<slug>`, and the structural metadata comes from
 * `setups.ts` rather than from the copy, so a search result and the library
 * card describe the same object.
 */

export interface SetupIndex {
  lab: Dictionary["lab"];
}

export function createSetupProvider(
  load: SearchIndexLoader<SetupIndex>,
): SearchProvider {
  return lazyProvider<SetupIndex>("setups", load, ({ lab }, query, context) => {
    const results: SearchResult[] = [];

    for (const setup of setups) {
      const copy = lab.items[setup.id as keyof typeof lab.items];
      if (copy === undefined) continue;

      // Title first, then the one-line purpose. Matching the full
      // specification would return a setup for any word in any of eight
      // paragraphs, which is recall without precision.
      const score = Math.max(
        scoreMatch(copy.title, query),
        scoreMatch(copy.purpose, query) * 0.5,
      );
      if (score === 0) continue;

      results.push({
        id: `setup.${setup.slug}`,
        kind: "setup",
        title: copy.title,
        // The evidence state travels with the result. A setup must never
        // appear in search looking more established than it is (§5).
        subtitle: `${lab.eyebrow} · ${lab.evidenceShort[setup.evidence.kind]}`,
        href: `/${context.locale}/setups/${setup.slug}`,
        // Between navigation destinations and concept definitions: a setup is
        // a real page, but someone typing a section name wants the section.
        score: score * 6,
      });
    }

    return results;
  });
}
