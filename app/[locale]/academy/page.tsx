import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProgressSummary, LessonReadDot } from "@/components/academy/LessonProgress";
import PageMain from "@/components/layout/PageMain";
import { isLocale, locales } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { curriculum, lessons } from "@/lib/trading/lessons";

/**
 * THE ACADEMY LANDING — master prompt §10, §11.
 *
 * A learning path, not a card grid. The curriculum is ordered and grouped by
 * level, every row states what it teaches and how long it takes, and the first
 * lesson is called out as the starting point — because "where do I begin" is
 * the question a curriculum exists to answer (§11).
 *
 * A server component. The only client code is the local progress marker, which
 * cannot be server-rendered because it lives in the reader's browser.
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
    title: `${dictionary.academy.title} — ${dictionary.nav.brand}`,
    description: dictionary.academy.lead,
    alternates: {
      canonical: `/${locale}/academy`,
      languages: Object.fromEntries(locales.map((code) => [code, `/${code}/academy`])),
    },
  };
}

export default async function AcademyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = await getDictionary(locale);
  const { academy, concepts } = dictionary;
  const first = lessons[0];
  const groups = curriculum();

  return (
    <PageMain className="container-page py-[var(--space-24)]">
      <header className="academy-header">
        <p className="type-label text-accent">{academy.eyebrow}</p>
        <h1 className="mt-4 max-w-[24ch] type-h1">{academy.title}</h1>
        <p className="mt-6 max-w-[var(--container-text)] type-lead">{academy.lead}</p>

        <div className="academy-header-actions">
          {first !== undefined ? (
            <Link href={`/${locale}/academy/${first.slug}`} className="btn btn-primary">
              {academy.startHere}
            </Link>
          ) : null}
          {/* One source of truth for the system story — the Academy points at
              it rather than restating it (§34). */}
          <Link href={`/${locale}/systems`} className="btn btn-ghost">
            {academy.systemCta}
          </Link>
        </div>

        <ProgressSummary total={lessons.length} academy={academy} />
      </header>

      <section className="academy-path" aria-label={academy.levelsLabel}>
        {groups.map((group) => (
          <section key={group.level} className="academy-level">
            <header className="academy-level-header">
              <h2 className="type-h3">{academy.levels[group.level]}</h2>
              <p className="type-caption text-muted">
                {academy.lessonsCount.replace("{n}", String(group.lessons.length))}
              </p>
            </header>

            <ol className="academy-lessons">
              {group.lessons.map((lesson) => {
                const copy = academy.lessons[lesson.id as keyof typeof academy.lessons];
                const order = lessons.indexOf(lesson) + 1;
                return (
                  <li key={lesson.id} className="academy-lesson-row">
                    <Link
                      href={`/${locale}/academy/${lesson.slug}`}
                      className="academy-lesson-link"
                    >
                      <span className="academy-lesson-index type-data">
                        {String(order).padStart(2, "0")}
                      </span>
                      <span className="academy-lesson-body">
                        <span className="academy-lesson-title type-h3">
                          {copy.title}
                          <LessonReadDot
                            lessonId={lesson.id}
                            label={academy.markedComplete}
                          />
                        </span>
                        <span className="academy-lesson-summary text-secondary">
                          {copy.summary}
                        </span>
                        {/* Canonical concept ids in the DOM, same contract the
                            Setup Lab and ConceptNode use. */}
                        <span className="academy-lesson-concepts type-caption">
                          {lesson.conceptIds.slice(0, 4).map((id) => (
                            <span key={id} data-concept={id}>
                              {concepts[id].term}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="academy-lesson-minutes type-data" dir="ltr">
                        {academy.minutes.replace("{n}", String(lesson.minutes))}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </section>
    </PageMain>
  );
}
