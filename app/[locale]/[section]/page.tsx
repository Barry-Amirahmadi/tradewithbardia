import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PageMain from "@/components/layout/PageMain";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { findNavItem, primaryNav } from "@/lib/navigation";

/**
 * Placeholder pages for the sections the information architecture declares but
 * Phase 0 does not implement — master prompt §68.
 *
 * These routes are real from day one: correct URLs, correct metadata, the full
 * shell, both languages. What they are not is dishonest — the page says which
 * phase the content lands in rather than showing a fake preview or a dead
 * link. An unknown segment still 404s, so the nav and the router cannot drift.
 */

/**
 * The section list is closed. Anything outside it is a routing miss, not a
 * page that renders and then throws.
 *
 * This matters for more than tidiness: a runtime `notFound()` inside an
 * on-demand render makes Next fall back to its internal error document, which
 * carries none of the application's CSS — the branded 404 arrived as an
 * unstyled blank page. With the params closed, an unknown section never
 * executes this component and is served the prerendered not-found instead.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    primaryNav.map((item) => ({ locale, section: item.segment })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; section: string }>;
}): Promise<Metadata> {
  const { locale, section } = await params;
  const item = findNavItem(section);
  if (!isLocale(locale) || item === undefined) return {};

  const dictionary = await getDictionary(locale);
  return {
    title: `${dictionary.nav[item.key]} — ${dictionary.nav.brand}`,
    description: dictionary.section.body,
    alternates: {
      canonical: `/${locale}/${section}`,
      languages: Object.fromEntries(
        locales.map((code) => [code, `/${code}/${section}`]),
      ),
    },
    // Nothing here is worth indexing yet. Letting six near-identical
    // placeholders into the index would dilute the pages that do have content.
    robots: { index: false, follow: true },
  };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ locale: string; section: string }>;
}) {
  const { locale, section } = await params;
  if (!isLocale(locale)) notFound();

  const item = findNavItem(section);
  if (item === undefined) notFound();

  const dictionary = await getDictionary(locale);

  return (
    <PageMain className="container-page flex min-h-[100svh] flex-col justify-center py-[var(--space-32)]">
      <p className="label-terminal text-accent">{dictionary.section.eyebrow}</p>
      <h1 className="mt-6 max-w-[16ch] text-[length:var(--text-h1)] font-medium">
        {dictionary.nav[item.key]}
      </h1>
      <p className="mt-6 max-w-[var(--container-text)] text-[length:var(--text-lead)] text-secondary">
        {dictionary.section.title}
      </p>
      <p className="mt-3 max-w-[var(--container-text)] text-secondary">
        {dictionary.section.body}
      </p>
      <div className="mt-[var(--space-12)]">
        <Link href={`/${locale}`} className="btn btn-ghost">
          {dictionary.section.back}
        </Link>
      </div>
    </PageMain>
  );
}
