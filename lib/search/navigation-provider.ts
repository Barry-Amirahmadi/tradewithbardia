import { hrefFor, primaryNav } from "../navigation";
import type { Dictionary } from "../i18n/dictionary-type";
import {
  scoreMatch,
  type SearchContext,
  type SearchProvider,
  type SearchResult,
} from "./provider";

/**
 * The one provider that ships — master prompt §9.
 *
 * It indexes exactly two things that genuinely exist: the navigation
 * destinations, and the palette's own commands. Lessons, setups, terms and
 * journal entries get their own providers when that content exists; inventing
 * them here would be the search equivalent of a fabricated backtest.
 *
 * Planned destinations are still indexed, because someone searching "replay"
 * should learn that it is coming rather than get an empty result — but they
 * carry no `href`, so the palette renders them as unreachable and cannot
 * navigate to a 404.
 */
export function createNavigationProvider(
  nav: Dictionary["nav"],
): SearchProvider {
  return {
    id: "navigation",
    search(query, context) {
      const results: SearchResult[] = [];

      for (const node of primaryNav) {
        const title = nav[node.labelKey];
        const score = scoreMatch(title, query);
        if (score > 0) {
          results.push({
            id: `nav.${node.id}`,
            kind: "page",
            title,
            href: hrefFor(context.locale, node) ?? undefined,
            score: score * 10, // top-level destinations outrank their children
          });
        }

        for (const child of node.children ?? []) {
          const childTitle = nav.groups[child.labelKey];
          const childScore = scoreMatch(childTitle, query);
          if (childScore === 0) continue;
          results.push({
            id: `nav.${child.id}`,
            kind: "page",
            title: childTitle,
            subtitle:
              child.status === "planned"
                ? `${title} · ${context.labels.comingSoon}`
                : title,
            href: hrefFor(context.locale, child, node) ?? undefined,
            score: childScore * 5,
          });
        }
      }

      return results;
    },
  };
}

/**
 * Commands are always available and always reachable — they act on the current
 * page rather than navigating, so they never depend on content existing.
 */
export function createCommandProvider(): SearchProvider {
  return {
    id: "commands",
    search(query, context) {
      const { labels } = context;
      const commands = [
        { id: "toggle-theme", title: labels.toggleTheme },
        { id: "switch-language", title: labels.switchLanguage },
        { id: "scroll-top", title: labels.scrollTop },
      ] as const;

      return commands
        .map((c) => ({ c, score: scoreMatch(c.title, query) }))
        .filter(({ score }) => score > 0)
        .map(({ c, score }) => ({
          id: `command.${c.id}`,
          kind: "command" as const,
          title: c.title,
          subtitle: labels.commands,
          commandId: c.id,
          score: score * 8,
        }));
    },
  };
}
