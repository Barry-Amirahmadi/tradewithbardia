import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PageMain from "@/components/layout/PageMain";
import TradingSystemStory from "@/components/sections/TradingSystem/TradingSystemStory";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * THE CANONICAL TRADING SYSTEM PAGE — master prompt §22.
 *
 * Resolves the IA problem the EPIC 04 review identified: the navigation
 * promised "Systems" and delivered an in-development placeholder, while the
 * actual story lived on the home page. EPIC 05 makes that worse rather than
 * better, because the story's call to action now points at a Setup Lab that
 * exists — so a reader could arrive at the setups having never been shown the
 * system they sit inside, which is exactly the misunderstanding the section
 * argues against.
 *
 * This renders the **same** `TradingSystemStory` component, not a second
 * implementation (§22). The home page keeps a condensed teaser and links here.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dictionary = await getDictionary(locale);
  return {
    title: `${dictionary.system.title} — ${dictionary.nav.brand}`,
    description: dictionary.system.lead,
    alternates: {
      canonical: `/${locale}/systems`,
      languages: Object.fromEntries(locales.map((code) => [code, `/${code}/systems`])),
    },
  };
}

export default async function SystemsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = await getDictionary(locale);

  return (
    <PageMain>
      <TradingSystemStory locale={locale} dictionary={dictionary} />
    </PageMain>
  );
}
