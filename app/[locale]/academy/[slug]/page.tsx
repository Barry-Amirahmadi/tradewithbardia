import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LessonReadToggle } from "@/components/academy/LessonProgress";
import SceneDisclosure from "@/components/charts/SceneDisclosure";
import PageMain from "@/components/layout/PageMain";
import ConceptNode from "@/components/trading/ConceptNode";
import { isLocale, locales, localeDirection } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  getLesson,
  lessonIndex,
  lessons,
  lessonSections,
  nextLesson,
  previousLesson,
  setupsForLesson,
} from "@/lib/trading/lessons";
import { heroScene } from "@/lib/viz/scenes/hero-scene";
import StaticTradingAnimation from "@/lib/viz/static-renderer";

/**
 * A LESSON — master prompt §7, §12, §13, §14, §19.
 *
 * The teaching sequence is data: `lessonSections` drives the page, so a
 * section missing in either language is a test failure rather than a gap.
 *
 * VISUALIZATION. The Academy adds no chart engine (§13). It renders the
 * existing `heroScene` through the existing **server** static renderer at the
 * beat where this lesson's concept appears — the liquidity lesson shows the
 * sweep, the risk lesson shows entry, stop and target together. That means:
 * zero canvas instances, zero renderer lifecycles, zero client JavaScript for
 * the figure, and one server-rendered chart per document, which is the EPIC 05
 * budget rule unchanged.
 *
 * The semantic explanation stays in HTML (§14). The figure is an aid; the
 * lesson is readable, crawlable and translatable without it.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    lessons.map((lesson) => ({ locale, slug: lesson.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const lesson = getLesson(slug);
  if (!isLocale(locale) || lesson === undefined) return {};

  const dictionary = await getDictionary(locale);
  const copy = dictionary.academy.lessons[lesson.id as keyof typeof dictionary.academy.lessons];
  return {
    title: `${copy.title} — ${dictionary.academy.eyebrow}`,
    description: copy.summary,
    alternates: {
      canonical: `/${locale}/academy/${slug}`,
      languages: Object.fromEntries(
        locales.map((code) => [code, `/${code}/academy/${slug}`]),
      ),
    },
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const lesson = getLesson(slug);
  if (lesson === undefined) notFound();

  const dictionary = await getDictionary(locale);
  const { academy, concepts, lab } = dictionary;
  const copy = academy.lessons[lesson.id as keyof typeof academy.lessons];
  const direction = localeDirection[locale];

  const next = nextLesson(lesson.id);
  const previous = previousLesson(lesson.id);
  const relatedSetups = setupsForLesson(lesson);
  const order = lessonIndex(lesson.id) + 1;

  return (
    <PageMain className="container-page py-[var(--space-24)]">
      <Link href={`/${locale}/academy`} className="btn btn-ghost">
        {academy.backToAcademy}
      </Link>

      <header className="lesson-header">
        <p className="type-label text-accent">
          {academy.levels[lesson.level]} · {String(order).padStart(2, "0")}
        </p>
        <h1 className="mt-4 max-w-[22ch] type-h1">{copy.title}</h1>
        <p className="mt-6 max-w-[var(--container-text)] type-lead">{copy.summary}</p>

        {lesson.prerequisites.length > 0 ? (
          <p className="lesson-prereq type-caption">
            <span className="text-muted">{academy.prerequisitesLabel}</span>
            {lesson.prerequisites.map((id) => {
              const required = lessons.find((l) => l.id === id);
              if (required === undefined) return null;
              const label = academy.lessons[required.id as keyof typeof academy.lessons];
              return (
                <Link key={id} href={`/${locale}/academy/${required.slug}`}>
                  {label.title}
                </Link>
              );
            })}
          </p>
        ) : null}
      </header>

      <section className="lesson-section">
        <h2 className="type-label text-accent">{academy.sections.explain}</h2>
        <p className="lesson-prose">{copy.explain}</p>
      </section>

      <section className="lesson-section">
        <h2 className="type-label text-accent">{academy.sections.visualize}</h2>
        <p className="lesson-prose">{copy.visualize}</p>

        <figure className="lesson-figure">
          <div className="lesson-figure-frame">
            <StaticTradingAnimation
              scene={heroScene}
              progress={lesson.visualProgress}
              direction={direction}
              description={dictionary.hero.sceneDescription}
              className="h-full w-full"
            />
          </div>
          <figcaption className="lesson-figure-caption">
            <p className="type-caption text-muted">{academy.figureCaption}</p>
            <SceneDisclosure scene={heroScene} labels={dictionary.viz.disclosures} />
          </figcaption>
        </figure>
      </section>

      <section className="lesson-section">
        <h2 className="type-label text-accent">{academy.sections.apply}</h2>
        <p className="lesson-prose">{copy.apply}</p>
      </section>

      <section className="lesson-section">
        <h2 className="type-label text-accent">{academy.sections.check}</h2>
        <p className="lesson-prose">{copy.check}</p>
      </section>

      <section className="lesson-takeaways">
        <h2 className="type-label text-accent">{academy.takeawaysLabel}</h2>
        <ul>
          {copy.takeaways.map((takeaway) => (
            <li key={takeaway}>{takeaway}</li>
          ))}
        </ul>
      </section>

      <section className="lesson-concepts" aria-label={academy.conceptsLabel}>
        <h2 className="type-label text-accent">{academy.conceptsLabel}</h2>
        <p className="lesson-concept-row">
          {lesson.conceptIds.map((id) => (
            <ConceptNode
              key={id}
              id={id}
              concepts={concepts}
              locale={locale}
              dict={dictionary.dict}
              surface="academy"
            />
          ))}
        </p>
      </section>

      {/* Derived from the concept graph, not authored here — the Setup Lab
          remains the source of truth for setup records (§19). */}
      {relatedSetups.length > 0 ? (
        <section className="lesson-setups" aria-label={academy.setupsLabel}>
          <h2 className="type-label text-accent">{academy.setupsLabel}</h2>
          <ul>
            {relatedSetups.map((setup) => {
              const setupCopy = lab.items[setup.id as keyof typeof lab.items];
              return (
                <li key={setup.id}>
                  <Link href={`/${locale}/setups/${setup.slug}`}>
                    <span className="type-h3">{setupCopy.title}</span>
                    <span className="text-secondary">{setupCopy.purpose}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <nav className="lesson-nav" aria-label={academy.nextLesson}>
        <LessonReadToggle lessonId={lesson.id} academy={academy} />

        <div className="lesson-nav-links">
          {previous !== undefined ? (
            <Link href={`/${locale}/academy/${previous.slug}`} className="btn btn-ghost">
              {academy.previousLesson}
            </Link>
          ) : null}
          {next !== undefined ? (
            <Link href={`/${locale}/academy/${next.slug}`} className="btn btn-primary">
              {academy.nextLesson}
            </Link>
          ) : (
            // The path ends rather than looping, and hands off to the place the
            // concepts are actually applied.
            <Link href={`/${locale}/setups`} className="btn btn-primary">
              {academy.endOfPathCta}
            </Link>
          )}
        </div>

        {next === undefined ? (
          <p className="type-caption text-muted">{academy.endOfPath}</p>
        ) : null}
      </nav>
    </PageMain>
  );
}
