import type { Locale } from "../i18n/config";

/**
 * SEARCH PROVIDER ABSTRACTION — master prompt §9, §16, §45.
 *
 * No backend search exists and none is built here. What exists is the seam:
 * the palette asks a registry of providers, and each future content domain —
 * Academy lessons, Setup Lab entries, Dictionary terms, the user's Journal —
 * registers one. Adding a domain is adding a provider, never editing the
 * palette.
 *
 * The Phase 0/1 rule about honesty applies to search too: the only provider
 * that ships indexes things that actually exist — the navigation destinations
 * and the palette's own commands. It does not pretend to search lessons that
 * have not been written.
 */

export type SearchKind =
  | "page"
  | "command"
  | "lesson"
  | "setup"
  | "term"
  | "journal";

/**
 * A result either navigates or runs a command, never both. Commands are
 * referenced by id rather than carrying a function, so results stay plain
 * data — serialisable, cacheable, and safe to return from a future server
 * provider.
 */
export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  href?: string;
  commandId?: CommandId;
  /** Higher sorts first. Providers score their own matches. */
  score: number;
}

export type CommandId =
  | "toggle-theme"
  | "switch-language"
  | "scroll-top";

export interface SearchContext {
  locale: Locale;
  /** Dictionary-derived labels, so providers never hardcode English. */
  labels: SearchLabels;
}

export interface SearchLabels {
  pages: string;
  commands: string;
  comingSoon: string;
  toggleTheme: string;
  switchLanguage: string;
  scrollTop: string;
}

export interface SearchProvider {
  id: string;
  /** Sync or async — a future network provider returns a promise. */
  search(query: string, context: SearchContext): SearchResult[] | Promise<SearchResult[]>;
}

const providers = new Map<string, SearchProvider>();

export function registerSearchProvider(provider: SearchProvider): () => void {
  providers.set(provider.id, provider);
  return () => {
    // Remove only *this* provider. Once a second source registers under the
    // same id — the palette remounting while an app-level provider is already
    // live — an earlier cleanup deleting by id alone would silently tear down
    // the newer one and leave a domain unsearchable.
    if (providers.get(provider.id) === provider) providers.delete(provider.id);
  };
}

/**
 * A provider that never answers must not hold the palette in a loading state
 * forever. `allSettled` isolates a provider that *throws*; only a deadline
 * isolates one that hangs, which is the more likely failure for a network
 * source on a bad connection.
 */
export const PROVIDER_TIMEOUT_MS = 2_000;

/**
 * Fan out to every provider and merge. `allSettled` so one failing provider —
 * an offline network source, say — degrades to fewer results rather than an
 * empty palette.
 */
export async function searchAll(
  query: string,
  context: SearchContext,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<SearchResult[]> {
  const settled = await Promise.allSettled(
    [...providers.values()].map((p) =>
      withDeadline(() => p.search(query, context), timeoutMs),
    ),
  );

  return settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

async function withDeadline(
  run: () => SearchResult[] | Promise<SearchResult[]>,
  timeoutMs: number,
): Promise<SearchResult[]> {
  // `Promise.resolve().then(run)` also turns a synchronous throw inside a
  // provider into a rejection, so one bad provider cannot break the fan-out.
  const work = Promise.resolve().then(run);
  // A provider that rejects *after* losing the race would otherwise surface as
  // an unhandled rejection.
  work.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`search provider exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Case- and diacritic-insensitive substring match, returning a score rather
 * than a boolean so a prefix match outranks a mid-word one. Persian text is
 * normalised through NFKD the same way Latin is, and the Arabic/Persian yeh
 * and kaf variants are folded — a reader typing `کیف` should match `كيف`.
 */
export function scoreMatch(haystack: string, needle: string): number {
  if (needle === "") return 1;
  const h = normalise(haystack);
  const n = normalise(needle);
  const at = h.indexOf(n);
  if (at < 0) return 0;
  if (at === 0) return 3;
  // Word-boundary match beats a match inside a word.
  return h[at - 1] === " " ? 2 : 1;
}

export function normalise(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[يى]/g, "ی") // Arabic yeh / alef maksura → Persian yeh
    .replace(/ك/g, "ک") // Arabic kaf → Persian keheh
    .replace(/[ً-ٰٟ]/g, "") // Arabic diacritics
    .replace(/[̀-ͯ]/g, "") // Latin combining marks
    .trim();
}
