/**
 * i18n configuration — master prompt §17.
 *
 * Direction is a property of the locale, not a theme or a user setting. It is
 * resolved once on the server, written to <html dir>, and everything below
 * reacts to it through CSS logical properties. No component branches on
 * `isRTL`; if you find yourself writing that, the layout is using a physical
 * property somewhere it should be using a logical one.
 */

export const locales = ["fa", "en"] as const;

export type Locale = (typeof locales)[number];

/**
 * Persian is the default. The primary audience reads Persian, and §17 lists it
 * first. This also forces the harder direction to be the one exercised on
 * every page load, which is the only reliable way to keep RTL from rotting.
 */
export const defaultLocale: Locale = "fa";

export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  fa: "rtl",
  en: "ltr",
};

/** BCP-47 tags for <html lang> and Intl formatters. */
export const localeTag: Record<Locale, string> = {
  fa: "fa-IR",
  en: "en-US",
};

/** Endonyms — a language switcher always labels a language in its own script. */
export const localeLabel: Record<Locale, string> = {
  fa: "فارسی",
  en: "English",
};

/** Compact label for the nav toggle. */
export const localeShortLabel: Record<Locale, string> = {
  fa: "FA",
  en: "EN",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/**
 * Swap the locale segment of a pathname, preserving the rest of the route.
 * `/fa/setups/unicorn` → `/en/setups/unicorn`
 */
export function withLocale(pathname: string, locale: Locale): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && segments[0] !== undefined && isLocale(segments[0])) {
    segments[0] = locale;
  } else {
    segments.unshift(locale);
  }
  return `/${segments.join("/")}`;
}
