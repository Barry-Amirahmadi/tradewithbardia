"use client";

import { MetricTile, Pill, UsageBars } from "./primitives";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { conceptUsage, performance, process, setupUsage } from "@/lib/journal/analytics";
import { closedTrades, isReviewed, outcome, rMultiple } from "@/lib/journal/calculations";
import {
  formatCount,
  formatDate,
  formatPercent,
  formatR,
  formatSignedMoney,
} from "@/lib/journal/format";
import type { StoredTrade } from "@/lib/journal/trade";
import type { TradingConceptId } from "@/lib/trading/concepts";

/**
 * THE DASHBOARD — master prompt §17, §37.
 *
 * Every figure comes from `analytics.ts`. Nothing on this screen is typed in,
 * and a test asserts that changing the demo records changes what appears here.
 *
 * Widgets are chosen for whether they answer a question, not for whether they
 * fill the grid: what happened, whether the process was followed, and what is
 * waiting to be reviewed. Where the sample cannot support a statistic, the
 * tile says so instead of showing a number (§6, §17).
 */
export default function DashboardView({
  locale,
  trades,
  journal,
  concepts,
  lab,
  onSelect,
}: {
  locale: Locale;
  trades: readonly StoredTrade[];
  journal: Dictionary["journal"];
  concepts: Dictionary["concepts"];
  lab: Dictionary["lab"];
  onSelect: (id: string) => void;
}) {
  const app = journal.app;
  const perf = performance(trades);
  const proc = process(trades);
  const recent = [...trades].reverse().slice(0, 5);
  const queue = closedTrades(trades).filter((trade) => !isReviewed(trade));

  return (
    <div className="japp-view">
      <h2 className="sr-only">{app.dashboard.title}</h2>

      <section aria-label={app.dashboard.performance}>
        <h3 className="type-label text-accent">{app.dashboard.performance}</h3>
        <div className="metric-grid">
          <MetricTile
            label={app.metrics.netPnl}
            value={formatSignedMoney(perf.netPnl, locale)}
            note={journal.insufficient}
            emphasis
          />
          <MetricTile label={app.metrics.averageR} value={formatR(perf.averageR)} note={journal.insufficient} />
          <MetricTile
            label={app.metrics.winRate}
            value={formatPercent(perf.winRate, locale)}
            note={app.minSample}
          />
          <MetricTile
            label={app.metrics.expectancy}
            value={formatSignedMoney(perf.expectancy, locale)}
            note={app.minSample}
          />
          <MetricTile label={app.metrics.sample} value={formatCount(perf.sample, locale)} />
          <MetricTile
            label={app.metrics.maxDrawdown}
            value={formatSignedMoney(perf.maxDrawdown === null ? null : -perf.maxDrawdown, locale)}
            note={journal.insufficient}
          />
        </div>
      </section>

      <section aria-label={app.dashboard.processTitle}>
        <h3 className="type-label text-accent">{app.dashboard.processTitle}</h3>
        <div className="metric-grid">
          <MetricTile label={app.metrics.adherence} value={formatPercent(proc.adherence, locale)} note={journal.insufficient} />
          <MetricTile label={app.metrics.reviewRate} value={formatPercent(proc.reviewRate, locale)} note={journal.insufficient} />
          <MetricTile label={app.metrics.open} value={formatCount(proc.open, locale)} />
          <MetricTile label={app.metrics.planned} value={formatCount(proc.planned, locale)} />
        </div>
      </section>

      <section aria-label={app.dashboard.queue}>
        <h3 className="type-label text-accent">{app.dashboard.queue}</h3>
        {queue.length === 0 ? (
          <p className="type-caption text-muted">{app.dashboard.queueEmpty}</p>
        ) : (
          <ul className="japp-list">
            {queue.map((trade) => (
              <li key={trade.id}>
                <button type="button" onClick={() => onSelect(trade.id)}>
                  <span className="japp-list-main">{lab.instruments[trade.instrument]}</span>
                  <span className="type-caption text-muted">{formatDate(trade.openedAt, locale)}</span>
                  <span className="type-data" dir="ltr">{formatR(rMultiple(trade))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={app.dashboard.recent}>
        <h3 className="type-label text-accent">{app.dashboard.recent}</h3>
        <ul className="japp-list">
          {recent.map((trade) => {
            const result = outcome(trade);
            return (
              <li key={trade.id}>
                <button type="button" onClick={() => onSelect(trade.id)}>
                  <span className="japp-list-main">{lab.instruments[trade.instrument]}</span>
                  <Pill kind={trade.status}>{app.statuses[trade.status]}</Pill>
                  {result !== null ? <Pill kind={result}>{app.outcomes[result]}</Pill> : null}
                  <span className="type-data" dir="ltr">{formatR(rMultiple(trade))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="japp-columns">
        <UsageBars
          label={app.dashboard.concepts}
          locale={locale}
          emptyLabel={app.empty}
          rows={conceptUsage(trades)
            .slice(0, 6)
            .map((row) => ({
              id: row.id,
              label: concepts[row.id as TradingConceptId].term,
              count: row.count,
            }))}
        />
        <UsageBars
          label={app.dashboard.setups}
          locale={locale}
          emptyLabel={app.empty}
          rows={setupUsage(trades).map((row) => ({
            id: row.id,
            label: lab.items[row.id as keyof typeof lab.items]?.title ?? row.id,
            count: row.count,
          }))}
        />
      </div>
    </div>
  );
}
