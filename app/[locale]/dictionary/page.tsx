import type { Metadata } from "next";
import { notFound } from "next/navigation";

import DictionaryBrowser from "@/components/dictionary/DictionaryBrowser";
import PageMain from "@/components/layout/PageMain";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { publishedEntries } from "@/lib/trading/dictionary";

/**
 * THE DICTIONARY LANDING — master prompt §10, §38.
 *
 * A dedicated static route, following the ownership pattern EPIC 05
 * established: one URL, one route owner, and the generic `[section]` builder
 * excludes this segment so nothing generates it twice.
 *
 * No renderer and no chart on this page. The metadata for all nineteen entries
 * is small enough to hand to one client component for local filtering, and it
 * is route-scoped — no other page can serialize it.
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
    title: `${dictionary.dict.title} — ${dictionary.nav.brand}`,
    description: dictionary.dict.lead,
    alternates: {
      canonical: `/${locale}/dictionary`,
      languages: Object.fromEntries(
        locales.map((code) => [code, `/${code}/dictionary`]),
      ),
    },
  };
}

export default async function DictionaryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = await getDictionary(locale);
  const { dict } = dictionary;

  return (
    <PageMain className="container-page py-[var(--space-24)]">
      <header className="dict-header">
        <p className="type-label text-accent">{dict.eyebrow}</p>
        <h1 className="mt-4 max-w-[20ch] type-h1">{dict.title}</h1>
        <p className="mt-6 max-w-[var(--container-text)] type-lead">{dict.lead}</p>
        <p className="mt-4 type-caption text-muted">
          {dict.resultsMany.replace("{n}", String(publishedEntries.length))}
        </p>
      </header>

      <DictionaryBrowser
        locale={locale}
        dict={dict}
        concepts={dictionary.concepts}
      />
    </PageMain>
  );
}
