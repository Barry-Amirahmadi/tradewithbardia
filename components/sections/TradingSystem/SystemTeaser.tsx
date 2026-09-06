import Link from "next/link";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { systemStages } from "@/lib/trading/system-stages";

/**
 * THE HOME TEASER — master prompt §22.
 *
 * The full Trading System Story now lives at `/systems`. The home page keeps
 * a condensed version: the claim, the nine stage names, and a way through.
 *
 * Not a second implementation of the story — it renders no stage prose, no
 * loop figure and no scroll wiring. It reads the same `systemStages` and the
 * same dictionary keys, so the two can never disagree about what the stages
 * are or what they are called.
 *
 * This also splits the home document, which was carrying both the hero's
 * inlined SVG fallback and nine stages of prose against a 110 kB raw budget.
 */
export default function SystemTeaser({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  const { system } = dictionary;

  return (
    <section className="system-teaser" aria-labelledby="system-teaser-title">
      <div className="container-page">
        <p className="type-label text-accent">{system.eyebrow}</p>
        <h2 id="system-teaser-title" className="mt-4 max-w-[20ch] type-h2">
          {system.title}
        </h2>
        <p className="mt-6 max-w-[var(--container-text)] type-lead">
          {system.lead}
        </p>

        {/* Names only. The teaser's job is to show that the process is closed
            and has parts; explaining the parts is the page it links to. */}
        <ol className="system-teaser-stages" aria-label={system.stagesLabel}>
          {systemStages.map((stage) => (
            <li key={stage.id} data-stage={stage.id}>
              <span className="type-data system-teaser-index">
                {String(stage.index + 1).padStart(2, "0")}
              </span>
              <span>{system.stages[stage.id].label}</span>
            </li>
          ))}
          <li className="system-teaser-loop" aria-hidden="true">
            <span>↻</span>
          </li>
        </ol>

        <Link href={`/${locale}/systems`} className="btn btn-primary mt-10">
          {system.loopTitle}
        </Link>
      </div>
    </section>
  );
}
