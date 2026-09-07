"use client";

import Link from "next/link";
import { useState } from "react";

import { MetricTile, Pill } from "./app/primitives";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { performance, process } from "@/lib/journal/analytics";
import { adherenceRate, outcome, realisedPnl, rMultiple } from "@/lib/journal/calculations";
import { demoTrades } from "@/lib/journal/demo-data";
import {
  formatDate,
  formatPercent,
  formatPrice,
  formatR,
  formatSignedMoney,
} from "@/lib/journal/format";

/**
 * THE INTERACTIVE DEMO — master prompt §13, §36, §37.
 *
 * A visitor picks a trade and sees the record, the review and the derived
 * figures. Understanding the product by using it, rather than by reading three
 * more paragraphs about it.
 *
 * PROPS ARE SLICES, NOT SECTIONS (EPIC 09 §41). This is a client component on
 * a public page, so everything it is handed is serialized into the document.
 * It used to receive the whole `journal` and `lab` dictionaries; when EPIC 09
 * added the capture form's copy to `journal.app`, all of it — field labels,
 * every validation message, the settings text — started shipping on a page
 * with no form on it, along with all five setup specifications from `lab`.
 *
 * The narrow prop types below are the fix, and they are load-bearing rather
 * than cosmetic: adding a key to `journal.app` can no longer silently widen a
 * public payload, because this component cannot see keys it did not ask for.
 * The same defect and the same remedy as the concept dictionary in EPIC 04.
 *
 * TWO HONESTY RULES, both structural:
 *
 * 1. It is labelled `DEMO DATA` in the heading, and the records themselves
 *    carry `origin: "demo"` — the label cannot be separated from the data.
 * 2. Every figure is computed by the same engine the application uses. There
 *    is no number typed into this file, and a test asserts that changing the
 *    demo records changes what this shows.
 *
 * The summary tiles are of the demo set, not of anyone's account, and the copy
 * says so. No balance, no equity curve, no performance claim (§13).
 */
type App = Dictionary["journal"]["app"];

/** Exactly the copy this demo renders, and nothing else. */
export interface JournalDemoCopy {
  demoLabel: string;
  demoNote: string;
  insufficient: string;
  openApp: string;
  metrics: App["metrics"];
  minSample: App["minSample"];
  outcomes: App["outcomes"];
  directions: App["directions"];
  detail: App["detail"];
  trades: App["trades"];
  review: App["review"];
  instruments: Dictionary["lab"]["instruments"];
}

export default function JournalDemo({
  locale,
  copy,
}: {
  locale: Locale;
  copy: JournalDemoCopy;
}) {
  const closed = demoTrades.filter((trade) => trade.status === "closed");
  const [activeId, setActiveId] = useState(closed[0]?.id ?? "");
  const active = demoTrades.find((trade) => trade.id === activeId);

  const perf = performance(demoTrades);
  const proc = process(demoTrades);

  return (
    <section className="journal-demo" aria-label={copy.demoLabel}>
      <header className="journal-demo-head">
        <p className="japp-banner-tag type-label">{copy.demoLabel}</p>
        <p className="type-caption text-muted max-w-[var(--container-text)]">
          {copy.demoNote}
        </p>
      </header>

      <div className="metric-grid">
        <MetricTile
          label={copy.metrics.netPnl}
          value={formatSignedMoney(perf.netPnl, locale)}
          note={copy.insufficient}
          emphasis
        />
        <MetricTile label={copy.metrics.averageR} value={formatR(perf.averageR)} note={copy.insufficient} />
        <MetricTile label={copy.metrics.winRate} value={formatPercent(perf.winRate, locale)} note={copy.minSample} />
        <MetricTile label={copy.metrics.adherence} value={formatPercent(proc.adherence, locale)} note={copy.insufficient} />
      </div>

      <div className="journal-demo-body">
        <ul className="journal-demo-list">
          {closed.map((trade) => {
            const result = outcome(trade);
            return (
              <li key={trade.id}>
                <button
                  type="button"
                  aria-pressed={trade.id === activeId}
                  onClick={() => setActiveId(trade.id)}
                >
                  <span className="japp-list-main">{copy.instruments[trade.instrument]}</span>
                  <span className="type-caption text-muted">
                    {formatDate(trade.openedAt, locale)}
                  </span>
                  {result !== null ? <Pill kind={result}>{copy.outcomes[result]}</Pill> : null}
                  <span className="type-data" dir="ltr">{formatR(rMultiple(trade))}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {active !== undefined ? (
          <article className="journal-demo-detail">
            <h3 className="type-h3">
              {copy.instruments[active.instrument]} · {copy.directions[active.direction]}
            </h3>

            <dl className="japp-dl">
              <div><dt>{copy.detail.entry}</dt><dd dir="ltr">{formatPrice(active.entry, locale)}</dd></div>
              <div><dt>{copy.detail.stop}</dt><dd dir="ltr">{formatPrice(active.stop, locale)}</dd></div>
              <div><dt>{copy.detail.exit}</dt><dd dir="ltr">{formatPrice(active.exit, locale)}</dd></div>
              <div><dt>{copy.trades.result}</dt><dd dir="ltr">{formatSignedMoney(realisedPnl(active), locale)}</dd></div>
              <div><dt>{copy.trades.rMultiple}</dt><dd dir="ltr">{formatR(rMultiple(active))}</dd></div>
            </dl>

            {active.review !== undefined ? (
              <>
                <h4 className="type-label text-accent">{copy.detail.reviewTitle}</h4>
                <p className="type-data" dir="ltr">{formatPercent(adherenceRate(active), locale)}</p>
                <ul className="japp-rules">
                  {active.review.rules.map((rule) => (
                    <li key={rule.id} data-adherence={rule.adherence}>
                      <span>{copy.review.rules[rule.id as keyof typeof copy.review.rules] ?? rule.id}</span>
                      <Pill kind={rule.adherence}>{copy.review.adherence[rule.adherence]}</Pill>
                    </li>
                  ))}
                </ul>
                {active.review.lessons !== undefined ? (
                  <p className="text-secondary">{active.review.lessons}</p>
                ) : null}
              </>
            ) : (
              <p className="type-caption text-muted">{copy.detail.notReviewed}</p>
            )}
          </article>
        ) : null}
      </div>

      <Link href={`/${locale}/app/dashboard`} className="btn btn-primary mt-8">
        {copy.openApp}
      </Link>
    </section>
  );
}
