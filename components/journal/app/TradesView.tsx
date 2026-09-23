"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import ConfirmDialog from "./ConfirmDialog";
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
import type { JournalLab } from "@/lib/journal/lab-view";
import { reviewState, type StoredTrade } from "@/lib/journal/trade";
import { dictionaryHref } from "@/lib/trading/dictionary";

/**
 * TRADE LIST AND DETAIL — master prompt §24, §25, §26.
 *
 * FILTERS ARE DERIVED, NEVER DECLARED (§24). A status, setup, instrument or
 * session that no record has does not appear as an option, and a dimension
 * with fewer than two distinct values does not appear at all — a filter that
 * cannot change the result is furniture. Same rule the Setup Lab follows.
 *
 * THE DETAIL IS THE RECORD VIEW (§25). Plan, execution, outcome, review, and
 * what the trade contributes to the numbers on the dashboard. That last
 * section exists because a journal that shows aggregate metrics without ever
 * showing which record produced what is asking to be trusted rather than
 * checked.
 *
 * ORIGIN IS ALWAYS VISIBLE (§27). A demo row says so in the table and in the
 * detail. It is never possible to read a figure here without knowing whether
 * it came from an illustrative record or the user's own.
 */

type Filters = {
  status: string | null;
  review: string | null;
  setup: string | null;
  instrument: string | null;
  session: string | null;
};

const NO_FILTERS: Filters = {
  status: null, review: null, setup: null, instrument: null, session: null,
};

export default function TradesView({
  locale,
  trades,
  journal,
  concepts,
  lab,
  selected,
  onSelect,
  onEdit,
  onReview,
  onDelete,
  onCreate,
}: {
  locale: Locale;
  trades: readonly StoredTrade[];
  journal: Dictionary["journal"];
  concepts: Dictionary["concepts"];
  lab: JournalLab;
  dict: Dictionary["dict"];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
  onReview: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onCreate: () => void;
}) {
  const app = journal.app;
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [confirming, setConfirming] = useState<string | null>(null);

  /**
   * Every filter dimension, built from the records that exist.
   *
   * A dimension with one distinct value is dropped: offering "Forex" as the
   * only instrument filter suggests there is something to narrow down when
   * there is not.
   */
  const dimensions = useMemo(() => {
    const distinct = <T,>(values: readonly T[]): T[] => [...new Set(values)];
    const build = (id: keyof Filters, values: readonly string[], label: (v: string) => string) => {
      const options = distinct(values).filter((v) => v !== "");
      return options.length < 2 ? null : { id, options, label };
    };

    return [
      build("status", trades.map((t) => t.status), (v) => app.statuses[v as keyof typeof app.statuses]),
      build("review", trades.map((t) => reviewState(t)), (v) => app.reviewStates[v as keyof typeof app.reviewStates]),
      build("instrument", trades.map((t) => t.instrument), (v) => lab.instruments[v as keyof typeof lab.instruments]),
      build("session", trades.map((t) => t.session ?? ""), (v) => lab.sessions[v as keyof typeof lab.sessions]),
      build("setup", trades.map((t) => t.setupId ?? ""), (v) => lab.items[v as keyof typeof lab.items]?.title ?? v),
    ].filter((d): d is NonNullable<typeof d> => d !== null);
  }, [trades, app, lab]);

  const visible = useMemo(
    () =>
      trades.filter((trade) => {
        if (filters.status !== null && trade.status !== filters.status) return false;
        if (filters.review !== null && reviewState(trade) !== filters.review) return false;
        if (filters.instrument !== null && trade.instrument !== filters.instrument) return false;
        if (filters.session !== null && trade.session !== filters.session) return false;
        if (filters.setup !== null && trade.setupId !== filters.setup) return false;
        return true;
      }),
    [trades, filters],
  );

  const active = Object.values(filters).some((v) => v !== null);
  const open = selected === null ? undefined : trades.find((trade) => trade.id === selected);

  const setFilter = (id: keyof Filters, value: string | null) =>
    setFilters((current) => ({ ...current, [id]: current[id] === value ? null : value }));

  return (
    <div className="japp-view">
      <header className="japp-view-head">
        <h2 className="type-h3">{app.trades.title}</h2>
        {/* The primary action of the whole application, as a contextual CTA
            rather than a sixth navigation item (§36). */}
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          {app.capture.addTrade}
        </button>
      </header>

      {dimensions.length > 0 ? (
        <div className="japp-filters-group">
          {dimensions.map((dimension) => (
            <fieldset key={dimension.id} className="japp-filters">
              <legend className="type-label">
                {dimension.id === "review" ? app.filters.review
                  : dimension.id === "status" ? app.trades.status
                  : dimension.id === "instrument" ? app.trades.instrument
                  : dimension.id === "session" ? app.filters.session
                  : app.filters.setup}
              </legend>
              {dimension.options.map((value) => (
                <label key={value} className="japp-chip">
                  <input
                    type="checkbox"
                    checked={filters[dimension.id] === value}
                    onChange={() => setFilter(dimension.id, value)}
                  />
                  <span>{dimension.label(value)}</span>
                </label>
              ))}
            </fieldset>
          ))}
          {active ? (
            <button type="button" className="btn btn-ghost" onClick={() => setFilters(NO_FILTERS)}>
              {app.filters.reset}
            </button>
          ) : null}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="type-lead text-muted">{app.empty}</p>
      ) : (
        <>
          <p className="type-caption text-muted" role="status">
            {app.filters.showing} <span dir="ltr">{visible.length}/{trades.length}</span>
          </p>
          <table className="japp-table">
            <thead>
              <tr>
                <th scope="col">{app.trades.instrument}</th>
                <th scope="col">{app.trades.direction}</th>
                <th scope="col">{app.trades.setup}</th>
                <th scope="col">{app.trades.status}</th>
                <th scope="col">{app.filters.review}</th>
                <th scope="col">{app.trades.opened}</th>
                <th scope="col">{app.trades.result}</th>
                <th scope="col">{app.trades.rMultiple}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((trade) => {
                const result = outcome(trade);
                const review = reviewState(trade);
                return (
                  <tr key={trade.id} data-selected={trade.id === selected} data-origin={trade.origin}>
                    <th scope="row">
                      <button type="button" onClick={() => onSelect(trade.id)}>
                        {lab.instruments[trade.instrument]}
                      </button>
                      {trade.origin === "demo" ? (
                        <span className="japp-origin type-caption">{journal.demoLabel}</span>
                      ) : null}
                    </th>
                    <td>{app.directions[trade.direction]}</td>
                    <td>{trade.setupId === undefined ? "—" : lab.items[trade.setupId as keyof typeof lab.items]?.title ?? trade.setupId}</td>
                    <td><Pill kind={trade.status}>{app.statuses[trade.status]}</Pill></td>
                    <td><Pill kind={review}>{app.reviewStates[review]}</Pill></td>
                    <td>{formatDate(trade.openedAt, locale)}</td>
                    <td>{result === null ? "—" : <Pill kind={result}>{app.outcomes[result]}</Pill>}</td>
                    <td className="type-data" dir="ltr">{formatR(rMultiple(trade))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {open !== undefined ? (
        <article className="japp-detail" aria-label={app.detail.title}>
          <header>
            <div>
              <h3 className="type-h3">
                {lab.instruments[open.instrument]} · {app.directions[open.direction]}
              </h3>
              <p className="type-caption text-muted">
                {formatDate(open.openedAt, locale)}
                {open.session !== undefined ? ` · ${lab.sessions[open.session]}` : ""}
                {open.timeframe !== undefined ? ` · ${lab.timeframes[open.timeframe]}` : ""}
                {open.origin === "demo" ? ` · ${journal.demoLabel}` : ""}
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => onSelect(null)}>
              {app.detail.close}
            </button>
          </header>

          <div className="japp-detail-actions">
            <button type="button" className="btn btn-ghost" onClick={() => onEdit(open.id)}>
              {app.actions.edit}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onReview(open.id)}>
              {app.actions.review}
            </button>
            <button type="button" className="btn btn-destructive" onClick={() => setConfirming(open.id)}>
              {app.actions.delete}
            </button>
          </div>

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
              source of truth for the specification (§13). */}
          {open.setupId !== undefined ? (
            <p>
              <Link href={`/${locale}/setups/${open.setupId}`} className="btn btn-ghost">
                {app.detail.openSetup}
              </Link>
            </p>
          ) : null}

          <section>
            <h4 className="type-label text-accent">{app.detail.concepts}</h4>
            {open.conceptIds.length === 0 ? (
              <p className="type-caption text-muted">{app.picker.empty}</p>
            ) : (
              <ul className="japp-concepts">
                {open.conceptIds.map((id) => (
                  <li key={id} data-concept={id}>
                    {/* Canonical concepts link to the canonical definition. */}
                    <Link href={dictionaryHref(locale, id)}>{concepts[id].term}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="type-label text-accent">{app.detail.reviewTitle}</h4>
            <p>
              <Pill kind={reviewState(open)}>{app.reviewStates[reviewState(open)]}</Pill>
            </p>
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

      <ConfirmDialog
        open={confirming !== null}
        title={app.actions.deleteTitle}
        body={app.actions.deleteBody}
        confirmLabel={app.actions.deleteConfirm}
        cancelLabel={app.actions.deleteCancel}
        onConfirm={() => {
          const id = confirming;
          setConfirming(null);
          if (id !== null) void onDelete(id);
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
