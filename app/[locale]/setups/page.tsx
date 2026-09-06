import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PageMain from "@/components/layout/PageMain";
import SetupLibrary from "@/components/setups/SetupLibrary";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * THE SETUP LABORATORY — master prompt §6.
 *
 * A dedicated static route rather than another `[section]` placeholder. The
 * setup dataset is loaded here and passed to one client component, so it is
 * route-scoped by construction: no other page in the application can serialize
 * it, which is the §2 rule expressed as architecture rather than as a warning.
 *
 * No renderer is mounted on this page at all. Cards carry a ~200 byte glyph;
 * full-fidelity visualization lives on the detail page and mounts once (§2).
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
    title: `${dictionary.lab.title} — ${dictionary.nav.brand}`,
    description: dictionary.lab.lead,
    alternates: {
      canonical: `/${locale}/setups`,
      languages: Object.fromEntries(locales.map((code) => [code, `/${code}/setups`])),
    },
  };
}

export default async function SetupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = await getDictionary(locale);
  const { lab } = dictionary;

  return (
    <PageMain className="container-page py-[var(--space-24)]">
      <header className="setup-lab-header">
        <p className="type-label text-accent">{lab.eyebrow}</p>
        <h1 className="mt-4 max-w-[20ch] type-h1">{lab.title}</h1>
        {/* The honesty statement is the lead, not a footnote. Nothing in this
            library has been tested, and the page says so before anything
            else (§5). */}
        <p className="mt-6 max-w-[var(--container-text)] type-lead">{lab.lead}</p>
      </header>

      <SetupLibrary
        locale={locale}
        lab={lab}
        concepts={dictionary.concepts}
      />
    </PageMain>
  );
}
