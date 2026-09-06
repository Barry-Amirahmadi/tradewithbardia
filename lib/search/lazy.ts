import type { SearchProvider, SearchResult } from "./provider";

/**
 * LAZY SEARCH PROVIDERS — master prompt §2, §13.
 *
 * Fixes a real defect introduced in EPIC 04 and prevents EPIC 05 from
 * repeating it at ten times the size.
 *
 * The concept provider used to be handed its copy as props: `Navbar` received
 * the whole `concepts` and `system` dictionaries so the command palette could
 * index them. `Navbar` is a client component, so React serialized all of it
 * into the RSC flight payload of **every route** — measured at 18.2 kB of the
 * 24.8 kB document for `/en/systems`, a placeholder page that renders neither.
 * Adding setups the same way would have shipped the entire setup library to
 * every page on the site.
 *
 * A provider now receives a LOADER rather than data. Nothing is fetched until
 * someone actually searches, the chunk is fetched once and cached for the
 * session, and a failed load degrades to fewer results rather than an empty
 * palette — `searchAll` already fans out with `allSettled`.
 *
 * The loader is a function rather than a hardcoded `import()` so that tests can
 * supply data synchronously without depending on bundler behaviour, and so a
 * future provider can load from the network with no change here.
 */

export type SearchIndexLoader<T> = () => Promise<T>;

/**
 * Wraps a provider so its data is fetched at most once, on first search.
 *
 * The in-flight promise is cached rather than the resolved value, so ten
 * keystrokes before the chunk lands produce one request, not ten.
 */
export function lazyProvider<T>(
  id: string,
  load: SearchIndexLoader<T>,
  search: (
    data: T,
    query: string,
    context: Parameters<SearchProvider["search"]>[1],
  ) => SearchResult[],
): SearchProvider {
  let pending: Promise<T> | null = null;

  return {
    id,
    async search(query, context) {
      // A failed import must not poison the provider for the whole session:
      // clear the cache so a later keystroke can retry.
      pending ??= load().catch((error: unknown) => {
        pending = null;
        throw error;
      });
      return search(await pending, query, context);
    },
  };
}
