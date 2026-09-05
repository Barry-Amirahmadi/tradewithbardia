import Link from "next/link";

import PageMain from "@/components/layout/PageMain";
import { localeDirection, locales, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * Branded 404 body — master prompt §70.
 *
 * `not-found.tsx` renders without route params in either boundary it can land
 * in, so the locale cannot be read from the route. Every locale's copy is
 * rendered and CSS reveals the matching one when a `[lang]` ancestor exists.
 *
 * Two boundaries, one component:
 *   app/[locale]/not-found.tsx — inside the locale wrapper, so `[lang]` gates
 *                                it down to a single language.
 *   app/not-found.tsx          — above the locale segment, where there is no
 *                                locale to speak of, so both are shown. That
 *                                is correct rather than a compromise: a path
 *                                that never reached a locale has none.
 *
 * Each block carries its own `lang` and `dir`, so it renders correctly no
 * matter which boundary caught it. `display: none` also removes the hidden
 * copy from the accessibility tree, so a screen reader hears one language.
 */
export default async function NotFoundContent() {
  const dictionaries = await Promise.all(
    locales.map(async (locale) => [locale, await getDictionary(locale)] as const),
  );

  return (
    <PageMain className="container-page flex min-h-[100svh] flex-col justify-center py-[var(--space-32)]">
      {dictionaries.map(([locale, dictionary]) => (
        <div
          key={locale}
          data-locale-only={locale}
          lang={locale}
          dir={localeDirection[locale as Locale]}
        >
          <p className="label-terminal numeric text-accent">
            {dictionary.notFound.code}
          </p>
          <h1 className="mt-6 max-w-[18ch] text-[length:var(--text-h1)] font-medium">
            {dictionary.notFound.title}
          </h1>
          <p className="mt-6 max-w-[var(--container-text)] text-[length:var(--text-lead)] text-secondary">
            {dictionary.notFound.body}
          </p>
          <div className="mt-[var(--space-12)]">
            <Link href={`/${locale}`} className="btn btn-primary">
              {dictionary.notFound.back}
            </Link>
          </div>
        </div>
      ))}
    </PageMain>
  );
}
