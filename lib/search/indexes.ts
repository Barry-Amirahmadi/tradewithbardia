import type { Locale } from "../i18n/config";
import type { ConceptIndex } from "./concept-provider";
import type { SetupIndex } from "./setup-provider";

/**
 * SEARCH INDEX LOADERS — master prompt §2, §13.
 *
 * The one place the palette's data is fetched, and the reason the setup
 * library does not end up in every route's payload the way the concept
 * dictionary did in EPIC 04.
 *
 * Two properties matter:
 *
 * - **Client-side dynamic `import()`.** The dictionary becomes its own chunk,
 *   requested when someone searches and never before. Nothing is serialized
 *   into any document.
 * - **One chunk per locale.** The import specifier has a static prefix and a
 *   variable segment, which is what lets the bundler split rather than bundle
 *   both languages into one file.
 *
 * These are typed as returning only the slice each provider needs, so adding a
 * sixth top-level dictionary section does not silently widen what search
 * pulls over the wire.
 */

async function dictionary(locale: Locale) {
  // `webpackChunkName` is honoured by Turbopack too, and keeps the emitted
  // chunk identifiable in a bundle report.
  const loaded = await import(
    /* webpackChunkName: "search-index" */ `../i18n/dictionaries/${locale}.json`
  );
  return (loaded.default ?? loaded) as typeof import("../i18n/dictionaries/en.json");
}

export async function loadConceptIndex(locale: Locale): Promise<ConceptIndex> {
  const dict = await dictionary(locale);
  return { concepts: dict.concepts, system: dict.system };
}

export async function loadSetupIndex(locale: Locale): Promise<SetupIndex> {
  const dict = await dictionary(locale);
  return { lab: dict.lab };
}
