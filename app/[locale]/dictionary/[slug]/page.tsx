import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PageMain from "@/components/layout/PageMain";
import { isLocale, locales, type Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getConcept, type TradingConceptId } from "@/lib/trading/concepts";
import {
  conceptContext,
  conceptForSlug,
  dictionaryHref,
  publishedEntries,
  slugForConcept,
} from "@/lib/trading/dictionary";

/**
 * A DICTIONARY TERM — master prompt §9, §16, §17, §18, §19, §25.
 *
 * The authoritative page for one concept, and the place every other surface
 * points at. Everything below the definition is a **relationship derived from
 * the canonical graph**, never authored here:
 *
 * - related, prerequisites and children come from `concepts.ts`
 * - the Academy lesson comes from `lessonForConcept()`
 * - the setups come from `setupsForConcept()`
 * - the Trading System stage comes from the stage list
 *
 * Nothing is duplicated: the Academy owns lesson content, the Setup Lab owns
 * setup records, `/systems` owns the process story. This page owns the
 * definition and links to the rest.
 *
 * §16 forbids inventing related content to fill space, so every block is
 * conditional. A concept with no lesson renders no lesson section.
 *
 * A pure server component — no client JavaScript at all.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    publishedEntries.map((entry) => ({
      locale,
      slug: slugForConcept(entry.conceptId),
    })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const conceptId = conceptForSlug(slug);
  if (!isLocale(locale) || conceptId === undefined) return {};

  const dictionary = await getDictionary(locale);
  const copy = dictionary.concepts[conceptId];
  return {
    title: `${copy.term} — ${dictionary.dict.eyebrow}`,
    // The short definition is the description: genuinely useful, already
    // written, and never keyword-stuffed (§25).
    description: copy.definition,
    alternates: {
      canonical: `/${locale}/dictionary/${slug}`,
      languages: Object.fromEntries(
        locales.map((code) => [code, `/${code}/dictionary/${slug}`]),
      ),
    },
  };
}

/**
 * Hoisted deliberately. A component declared inside another component is a new
 * type on every render, which remounts its whole subtree and discards state —
 * so `react-hooks/static-components` rejects it, correctly.
 */
function ConceptList({
  ids,
  label,
  locale,
  concepts,
}: {
  ids: readonly TradingConceptId[];
  label: string;
  locale: Locale;
  concepts: Dictionary["concepts"];
}) {
  if (ids.length === 0) return null;
  return (
    <section className="dict-relation">
      <h2 className="type-label text-accent">{label}</h2>
      <ul className="dict-relation-list">
        {ids.map((id) => (
          <li key={id}>
            <Link href={dictionaryHref(locale, id)} data-concept={id}>
              <span className="type-h3">{concepts[id].term}</span>
              <span className="text-secondary">{concepts[id].definition}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function TermPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const conceptId = conceptForSlug(slug);
  if (conceptId === undefined) notFound();

  const context = conceptContext(conceptId);
  if (context === undefined) notFound();

  const dictionary = await getDictionary(locale);
  const { dict, concepts, academy, lab, system } = dictionary;
  const concept = getConcept(conceptId);
  const copy = concepts[conceptId];

  return (
    <PageMain className="container-page py-[var(--space-24)]">
      <Link href={`/${locale}/dictionary`} className="btn btn-ghost">
        {dict.backToDictionary}
      </Link>

      <header className="dict-term-header">
        <p className="type-label text-accent">
          {dict.eyebrow} · {dict.categories[context.entry.category]}
        </p>
        <h1 className="mt-4 type-h1">
          {copy.term}
          {concept.abbr !== undefined ? (
            <span className="dict-term-abbr type-data" dir="ltr">
              {concept.abbr}
            </span>
          ) : null}
        </h1>

        {context.entry.aliases.length > 0 ? (
          <p className="dict-aliases type-caption text-muted" dir="ltr">
            {dict.alsoKnownAs}: {context.entry.aliases.join(" · ")}
          </p>
        ) : null}
      </header>

      <section className="dict-definition">
        <h2 className="type-label text-accent">{dict.shortLabel}</h2>
        {/* The canonical short definition — the same string the concept card,
            the search result and every inline reference show. */}
        <p className="dict-short type-lead">{copy.definition}</p>
      </section>

      <section className="dict-definition">
        <h2 className="type-label text-accent">{dict.fullLabel}</h2>
        <p className="dict-full text-secondary">{copy.full}</p>
      </section>

      <ConceptList
        ids={context.prerequisites}
        label={dict.prerequisitesLabel}
        locale={locale}
        concepts={concepts}
      />
      <ConceptList
        ids={context.children}
        label={dict.childrenLabel}
        locale={locale}
        concepts={concepts}
      />
      <ConceptList
        ids={context.related}
        label={dict.relatedLabel}
        locale={locale}
        concepts={concepts}
      />

      {context.lesson !== undefined ? (
        <section className="dict-relation">
          <h2 className="type-label text-accent">{dict.lessonLabel}</h2>
          <ul className="dict-relation-list">
            <li>
              <Link href={`/${locale}/academy/${context.lesson.slug}`}>
                <span className="type-h3">
                  {academy.lessons[context.lesson.id as keyof typeof academy.lessons].title}
                </span>
                <span className="text-secondary">
                  {academy.lessons[context.lesson.id as keyof typeof academy.lessons].summary}
                </span>
              </Link>
            </li>
          </ul>
        </section>
      ) : null}

      {context.setups.length > 0 ? (
        <section className="dict-relation">
          <h2 className="type-label text-accent">{dict.setupsLabel}</h2>
          <ul className="dict-relation-list">
            {context.setups.map((setup) => (
              <li key={setup.id}>
                <Link href={`/${locale}/setups/${setup.slug}`}>
                  <span className="type-h3">
                    {lab.items[setup.id as keyof typeof lab.items].title}
                  </span>
                  <span className="text-secondary">
                    {lab.items[setup.id as keyof typeof lab.items].purpose}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {context.stage !== undefined ? (
        <section className="dict-stage">
          <h2 className="type-label text-accent">{dict.stageLabel}</h2>
          <p className="mt-3 type-h3">{system.stages[context.stage].label}</p>
          <p className="mt-2 max-w-[var(--container-text)] text-secondary">
            {system.stages[context.stage].question}
          </p>
          {/* One source of truth — the story is not restated here (§19). */}
          <Link href={`/${locale}/systems#system-${context.stage}`} className="btn btn-ghost mt-6">
            {dict.stageCta}
          </Link>
        </section>
      ) : null}
    </PageMain>
  );
}
