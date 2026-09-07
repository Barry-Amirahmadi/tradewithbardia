import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import JournalDemo from "@/components/journal/JournalDemo";
import PageMain from "@/components/layout/PageMain";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

/**
 * THE PUBLIC JOURNAL PAGE — master prompt §11, §12, §42, §44.
 *
 * The product argument, and the only indexable Journal surface. `/app/*` is a
 * private shell and carries `noindex`; this page carries the content.
 *
 * The narrative is RECORD → REVIEW → CLASSIFY → MEASURE → DISCOVER → REFINE,
 * rendered from data so the six stages are one loop rather than six hand-built
 * blocks. A server component: the copy is real HTML, crawlable and
 * translatable, with one small client island for the demo.
 *
 * No testimonials, no user counts, no performance claims — §44. The strongest
 * thing this page says about results is that the demo figures are computed
 * from demo records.
 */

const stages = ["record", "review", "classify", "measure", "discover", "refine"] as const;

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
    title: `${dictionary.journal.eyebrow} — ${dictionary.nav.brand}`,
    description: dictionary.journal.lead,
    alternates: {
      canonical: `/${locale}/journal`,
      languages: Object.fromEntries(locales.map((code) => [code, `/${code}/journal`])),
    },
  };
}

export default async function JournalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = await getDictionary(locale);
  const { journal } = dictionary;

  return (
    <PageMain className="container-page py-[var(--space-24)]">
      <header className="journal-header">
        <p className="type-label text-accent">{journal.eyebrow}</p>
        <h1 className="mt-4 max-w-[24ch] type-h1">{journal.title}</h1>
        <p className="mt-6 max-w-[var(--container-text)] type-lead">{journal.lead}</p>

        <div className="journal-actions">
          <Link href={`/${locale}/app/dashboard`} className="btn btn-primary">
            {journal.openApp}
          </Link>
          <p className="type-caption text-muted">{journal.openAppNote}</p>
        </div>
      </header>

      <section className="journal-why">
        <h2 className="type-h3 max-w-[20ch]">{journal.whyTitle}</h2>
        <p className="mt-4 max-w-[var(--container-text)] text-secondary">{journal.whyBody}</p>
        <ul className="journal-points">
          {journal.whyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      <section className="journal-loop" aria-label={journal.loopLabel}>
        <h2 className="type-label text-accent">{journal.loopLabel}</h2>
        <ol className="journal-stages">
          {stages.map((id, index) => (
            <li key={id} className="journal-stage">
              <p className="journal-stage-index type-data">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="type-h3">{journal.stages[id].label}</h3>
              <p className="mt-3 text-secondary">{journal.stages[id].body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* The one client island on this page. Labelled DEMO DATA, and every
          figure inside it is computed from the demo records (§13, §37). */}
      <JournalDemo locale={locale} journal={journal} lab={dictionary.lab} />
    </PageMain>
  );
}
