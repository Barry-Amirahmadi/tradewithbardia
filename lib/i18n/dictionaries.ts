import "server-only";

import type { Locale } from "./config";
import type { Dictionary } from "./dictionary-type";

/**
 * The English dictionary is the structural source of truth: its shape defines
 * `Dictionary`, so a key added to fa.json but missing from en.json — or a
 * translation file that drifts out of shape — is a type error, not a runtime
 * `undefined` rendered into the page.
 */
export type { Dictionary };

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: async () => (await import("./dictionaries/en.json")).default,
  fa: async () => (await import("./dictionaries/fa.json")).default,
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]();
}
