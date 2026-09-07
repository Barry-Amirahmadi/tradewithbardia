"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Pill } from "./primitives";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import {
  adherenceRate,
  holdingMinutes,
  outcome,
  plannedR,
  realisedPnl,
  rMultiple,
} from "@/lib/journal/calculations";
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatPercent,
  formatPrice,
  formatR,
  formatSignedMoney,
} from "@/lib/journal/format";
import type { StoredTrade } from "@/lib/journal/trade";
import { dictionaryHref } from "@/lib/trading/dictionary";

/**
 * TRADE LIST AND DETAIL — master prompt §33, §34.
 *
 * Filters derive from the records, exactly as the Setup Lab's do: a status
 * that no trade has does not appear as an option. Nothing here is hardcoded.
 *
 * The detail panel is the §34 sequence — plan, execution, outcome, review,
 * concepts — and it opens from a URL fragment, so a trade can be linked to
 * without its id ever reaching a server.
 */
export default function TradesView({
  locale,
  trades,
  journal,
  concepts,
  lab,
  selected,
  onSelect,
}: {
  locale: Locale;
  trades: readonly StoredTrade[];
  journal: Dictionary["journal"];
  concepts: Dictionary["concepts"];
  lab: Dictionary["lab"];
  dict: Dictionary["dict"];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const app = journal.app;
  const [status, setStatus] = useState<string | null>(null);

  // Derived, not declared: only statuses the data actually contains.
  const statuses = useMemo(
    () => [...new Set(trades.map((trade) => trade.status))],
    [trades],
  );

  const visible = useMemo(
    () => (status === null ? trades : trades.filter((trade) => trade.status === status)),
    [trades, status],
  );

  const open = selected === null ? undefined : trades.find((trade) => trade.id === selected);

  return (
    <div className="japp-view">
      <h2 className="type-h3">{app.trades.title}</h2>

      <fieldset className="japp-filters">
        <legend className="sr-only">{app.trades.status}</legend>
        <label className="japp-chip">
          <input type="radio" name="status" checked={status === null} onChange={() => setStatus(null)} />
          <span>{app.trades.filterAll}</span>
        </label>
        {statuses.map((id) => (
          <label key={id} className="japp-chip">
            <input type="radio" name="status" checked={status === id} onChange={() => setStatus(id)} />
            <span>{app.statuses[id]}</span>
          </label>
        ))}
      </fieldset>

      {visible.length === 0 ? (
        <p className="type-lead text-muted">{app.empty}</p>
      ) : (
        // A table on desktop, stacked rows on a phone. The header is hidden
        // rather than removed, so the columns stay announced either way.
        <table className="japp-table">
          <thead>
            <tr>
              <th scope="col">{app.trades.instrument}</th>
              <th scope="col">{app.trades.direction}</th>
              <th scope="col">{app.trades.status}</th>
              <th scope="col">{app.trades.opened}</th>
              <th scope="col">{app.trades.result}</th>
              <th scope="col">{app.trades.rMultiple}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((trade) => {
              const result = outcome(trade);
              return (
                <tr key={trade.id} data-selected={trade.id === selected}>
                  <th scope="row">
                    <button type="button" onClick={() => onSelect(trade.id)}>
                      {lab.instruments[trade.instrument]}
                    </button>
                  </th>
                  <td>{app.directions[trade.direction]}</td>
                  <td><Pill kind={trade.status}>{app.statuses[trade.status]}</Pill></td>
                  <td>{formatDate(trade.openedAt, locale)}</td>
                  <td>{result === null ? "—" : <Pill kind={result}>{app.outcomes[result]}</Pill>}</td>
                  <td className="type-data" dir="ltr">{formatR(rMultiple(trade))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {open !== undefined ? (
        <article className="japp-detail" aria-label={app.detail.title}>
          <header>
            <h3 className="type-h3">
              {lab.instruments[open.instrument]} · {app.directions[open.direction]}
            </h3>
            <button type="button" className="btn btn-ghost" onClick={() => onSelect(null)}>
              {app.detail.close}
            </button>
          </header>

          <section>
            <h4 className="type-label text-accent">{app.detail.plan}</h4>
            <dl className="japp-dl">
              <div><dt>{app.detail.entry}</dt><dd dir="ltr">{formatPrice(open.entry, locale)}</dd></div>
              <div><dt>{app.detail.stop}</dt><dd dir="ltr">{formatPrice(open.stop, locale)}</dd></div>
              <div><dt>{app.detail.target}</dt><dd dir="ltr">{formatPrice(open.target, locale)}</dd></div>
              <div><dt>{app.detail.risk}</dt><dd dir="ltr">{formatMoney(open.riskAmount, locale)}</dd></div>
              <div><dt>{app.detail.plannedR}</dt><dd dir="ltr">{formatR(plannedR(open))}</dd></div>
            </dl>
          </section>

          <section>
            <h4 className="type-label text-accent">{app.detail.outcome}</h4>
            <dl className="japp-dl">
              <div><dt>{app.detail.exit}</dt><dd dir="ltr">{formatPrice(open.exit, locale)}</dd></div>
              <div><dt>{app.trades.result}</dt><dd dir="ltr">{formatSignedMoney(realisedPnl(open), locale)}</dd></div>
              <div><dt>{app.trades.rMultiple}</dt><dd dir="ltr">{formatR(rMultiple(open))}</dd></div>
              <div><dt>{app.detail.held}</dt><dd dir="ltr">{formatDuration(holdingMinutes(open), locale)}</dd></div>
            </dl>
          </section>

          {/* The setup is referenced, never copied — the Setup Lab stays the
              source of truth for the specification (§20). */}
          {open.setupId !== undefined ? (
            <p>
              <Link href={`/${locale}/setups/${open.setupId}`} className="btn btn-ghost">
                {app.detail.openSetup}
              </Link>
            </p>
          ) : null}

          <section>
            <h4 className="type-label text-accent">{app.detail.concepts}</h4>
            <ul className="japp-concepts">
              {open.conceptIds.map((id) => (
                <li key={id} data-concept={id}>
                  {/* Canonical concepts link to the canonical definition (§22). */}
                  <Link href={dictionaryHref(locale, id)}>{concepts[id].term}</Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="type-label text-accent">{app.detail.reviewTitle}</h4>
            {open.review === undefined ? (
              <p className="type-caption text-muted">{app.detail.notReviewed}</p>
            ) : (
              <>
                <p className="type-data" dir="ltr">
                  {formatPercent(adherenceRate(open), locale)}
                </p>
                <ul className="japp-rules">
                  {open.review.rules.map((rule) => (
                    <li key={rule.id} data-adherence={rule.adherence}>
                      <span>{app.review.rules[rule.id as keyof typeof app.review.rules] ?? rule.id}</span>
                      <Pill kind={rule.adherence}>{app.review.adherence[rule.adherence]}</Pill>
                      {rule.note !== undefined ? (
                        <span className="type-caption text-muted">{rule.note}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {open.review.lessons !== undefined ? (
                  <p className="text-secondary">{open.review.lessons}</p>
                ) : null}
              </>
            )}
          </section>

          {open.notes !== undefined ? (
            <section>
              <h4 className="type-label text-accent">{app.detail.notes}</h4>
              <p className="text-secondary">{open.notes}</p>
            </section>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}
