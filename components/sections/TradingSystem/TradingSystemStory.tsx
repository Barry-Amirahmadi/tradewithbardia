import Link from "next/link";

import SystemScroller from "./SystemScroller";
import ConceptNode from "@/components/trading/ConceptNode";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { systemStages } from "@/lib/trading/system-stages";

/**
 * THE TRADING SYSTEM STORY — master prompt §1, §3, §16, §25.
 *
 * Supersedes the old `Process` section, which listed seven steps as static
 * cards. Those seven steps were one of three places the concept vocabulary
 * was written down; they now come from `system-stages.ts`, which shares its
 * ids with `concepts.ts`, so the section, the Setup Lab, the Dictionary and
 * search will all name `liquidity` with the same string.
 *
 * A SERVER COMPONENT, and that is the important property. Every stage's
 * question and body is real HTML in the document: crawlable, translatable,
 * readable with JavaScript off, and unaffected by whether the scroll wiring
 * ever mounts (§25). The client shell around it adds the loop diagram and the
 * active-stage highlight — enhancements over content that already works.
 */
export default function TradingSystemStory({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  const { system, concepts } = dictionary;

  return (
    <SystemScroller
      system={system}
      header={
        <header className="system-header">
          <p className="type-label text-accent">{system.eyebrow}</p>
          <h2 id="trading-system-title" className="mt-4 max-w-[18ch] type-h2">
            {system.title}
          </h2>
          <p className="mt-5 max-w-[42ch] type-lead">{system.lead}</p>
        </header>
      }
    >
      <ol className="system-stage-list">
        {systemStages.map((stage) => {
          const copy = system.stages[stage.id];
          // The stage's own id leads its concept list; the rest are the
          // mechanisms it introduces. Rendering from `conceptIds` rather than
          // from a hand-written list per stage is what keeps the copy, the
          // knowledge graph and search describing the same set.
          const mechanisms = stage.conceptIds.slice(1);

          return (
            <li
              key={stage.id}
              id={`system-${stage.id}`}
              className="system-stage"
              data-stage={stage.id}
              // A stage IS a concept (EPIC 04), so it carries the canonical id
              // as well. Without this, `liquidity` was findable on every
              // surface except the one that introduces it.
              data-concept={stage.id}
            >
              <article>
                <p className="system-stage-index type-data">
                  {String(stage.index + 1).padStart(2, "0")}
                </p>
                <h3 className="system-stage-label type-label text-accent">
                  {copy.label}
                </h3>
                {/* The question is the heading a reader actually scans. Each
                    stage is a decision, and a decision reads as a question. */}
                <p className="system-stage-question type-h3">{copy.question}</p>
                <p className="system-stage-body type-body text-secondary">
                  {copy.body}
                </p>

                {mechanisms.length > 0 ? (
                  <p className="system-stage-concepts">
                    <span className="sr-only">{system.conceptsLabel}</span>
                    {mechanisms.map((id) => (
                      <ConceptNode
                        key={id}
                        id={id}
                        concepts={concepts}
                        locale={locale}
                        dict={dictionary.dict}
                        surface="trading-system"
                      />
                    ))}
                  </p>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>

      {/*
        The close. The loop is stated in words as well as drawn, because the
        figure is an aid and the claim is the content — and because a reader
        with the figure hidden still has to arrive at the same conclusion.
      */}
      <div className="system-loop-close">
        <p className="type-label text-accent">{system.loopEyebrow}</p>
        <h3 className="mt-4 max-w-[20ch] type-h3">{system.loopTitle}</h3>
        <p className="mt-4 max-w-[46ch] text-secondary">{system.loopBody}</p>
        {/* Hands off to the Setup Lab without building it — the reader should
            leave wanting to inspect the setups (§16). */}
        <Link href={`/${locale}/setups`} className="btn btn-primary mt-8">
          {system.cta}
        </Link>
      </div>
    </SystemScroller>
  );
}
