import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import SceneDisclosure from "@/components/charts/SceneDisclosure";
import PageMain from "@/components/layout/PageMain";
import SetupReplay from "@/components/setups/SetupReplay";
import ConceptNode from "@/components/trading/ConceptNode";
import { isLocale, locales, localeDirection } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getSetup, setupSections, setups } from "@/lib/trading/setups";
import { heroScene } from "@/lib/viz/scenes/hero-scene";

/**
 * SETUP DETAIL — master prompt §8.
 *
 * The specification, in the order §8 asks for it: context, preconditions,
 * liquidity, structure, trigger, entry, invalidation, risk, review. Rendered
 * from `setupSections` rather than as nine hand-written blocks, so a section
 * missing in either language is a test failure rather than a gap on the page.
 *
 * The page answers "why does this setup exist, and when is it invalid?" — the
 * invalidation section is given the same weight as the entry, because a
 * specification that only describes the good case is marketing.
 *
 * A server component throughout. The only client code is the replay figure,
 * and it mounts its renderer only once scrolled into view.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    setups.map((setup) => ({ locale, slug: setup.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const setup = getSetup(slug);
  if (!isLocale(locale) || setup === undefined) return {};

  const dictionary = await getDictionary(locale);
  const copy = dictionary.lab.items[setup.id as keyof typeof dictionary.lab.items];
  return {
    title: `${copy.title} — ${dictionary.nav.brand}`,
    description: copy.purpose,
    alternates: {
      canonical: `/${locale}/setups/${slug}`,
      languages: Object.fromEntries(
        locales.map((code) => [code, `/${code}/setups/${slug}`]),
      ),
    },
  };
}

export default async function SetupDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const setup = getSetup(slug);
  if (setup === undefined) notFound();

  const dictionary = await getDictionary(locale);
  const { lab, concepts } = dictionary;
  const copy = lab.items[setup.id as keyof typeof lab.items];
  const direction = localeDirection[locale];

  return (
    <PageMain className="container-page py-[var(--space-24)]">
      <Link href={`/${locale}/setups`} className="btn btn-ghost">
        {lab.backToLibrary}
      </Link>

      <header className="setup-detail-header">
        <p className="type-label text-accent">{lab.eyebrow}</p>
        <h1 className="mt-4 max-w-[22ch] type-h1">{copy.title}</h1>
        <p className="mt-6 max-w-[var(--container-text)] type-lead">{copy.purpose}</p>

        {/* Evidence stated at the top, in full. A reader should know what this
            document is before they read a word of the specification (§5). */}
        <p className="setup-evidence mt-8" data-evidence={setup.evidence.kind}>
          <span className="type-label">{lab.evidenceLabel}</span>
          <span className="text-secondary">{lab.evidence[setup.evidence.kind]}</span>
        </p>
      </header>

      <section className="setup-detail-meta" aria-label={lab.metaLabel}>
        <dl>
          <div>
            <dt className="type-label">{lab.dimensions.instrument}</dt>
            <dd>{setup.instruments.map((v) => lab.instruments[v]).join(" · ")}</dd>
          </div>
          <div>
            <dt className="type-label">{lab.dimensions.session}</dt>
            <dd>{setup.sessions.map((v) => lab.sessions[v]).join(" · ")}</dd>
          </div>
          <div>
            <dt className="type-label">{lab.dimensions.timeframe}</dt>
            <dd dir="ltr">{setup.timeframes.map((v) => lab.timeframes[v]).join(" · ")}</dd>
          </div>
          <div>
            <dt className="type-label">{lab.dimensions.difficulty}</dt>
            <dd>{lab.difficulties[setup.difficulty]}</dd>
          </div>
        </dl>
      </section>

      <SetupReplay
        lab={lab}
        direction={direction}
        description={dictionary.hero.sceneDescription}
        setupSlug={setup.slug}
        disclosure={
          <SceneDisclosure scene={heroScene} labels={dictionary.viz.disclosures} />
        }
      />

      <section className="setup-concepts-block" aria-label={lab.conceptsLabel}>
        <h2 className="type-label text-accent">{lab.conceptsLabel}</h2>
        <p className="setup-concept-row">
          {setup.conceptIds.map((id) => (
            <ConceptNode
              key={id}
              id={id}
              concepts={concepts}
              locale={locale}
              dict={dictionary.dict}
              surface="setup-detail"
            />
          ))}
        </p>

        <h2 className="mt-8 type-label text-accent">{lab.prerequisitesLabel}</h2>
        <p className="setup-concept-row">
          {setup.prerequisites.map((id) => (
            <ConceptNode
              key={id}
              id={id}
              concepts={concepts}
              locale={locale}
              dict={dictionary.dict}
              surface="setup-detail"
            />
          ))}
        </p>
      </section>

      <ol className="setup-spec">
        {setupSections.map((section, index) => (
          <li key={section} className="setup-spec-item">
            <p className="type-data setup-spec-index">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="type-h3">{lab.sections[section]}</h2>
            <p className="mt-3 max-w-[var(--container-text)] text-secondary">
              {copy[section]}
            </p>
          </li>
        ))}
      </ol>
    </PageMain>
  );
}
