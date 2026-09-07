"use client";

import { MetricTile, UsageBars } from "./primitives";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import {
  conceptUsage,
  performance,
  process,
  ruleViolations,
  setupUsage,
} from "@/lib/journal/analytics";
import { formatCount, formatPercent, formatR, formatSignedMoney } from "@/lib/journal/format";
import type { StoredTrade } from "@/lib/journal/trade";
import type { TradingConceptId } from "@/lib/trading/concepts";

/**
 * ANALYTICS — master prompt §18, §19, §37.
 *
 * Three views, matching the three questions a trading journal can honestly
 * answer at this sample size: what happened, whether the process was followed,
 * and what recurs.
 *
 * Nothing here does arithmetic. Every figure arrives from `analytics.ts`,
 * which is also the boundary a future AI analyst sits behind — it will read
 * these computed results and explain them, never compute them itself (§19).
 *
 * No statistical inference is offered. A concept appearing in four losing
 * trades is a count, not a cause, and labelling it as one would be exactly the
 * kind of manufactured insight §18 warns against.
 */
export default function AnalyticsView({
  locale,
  trades,
  journal,
  concepts,
  lab,
}: {
  locale: Locale;
  trades: readonly StoredTrade[];
  journal: Dictionary["journal"];
  concepts: Dictionary["concepts"];
  lab: Dictionary["lab"];
}) {
  const app = journal.app;
  const perf = performance(trades);
  const proc = process(trades);

  return (
    <div className="japp-view">
      <h2 className="type-h3">{app.analytics.title}</h2>
      <p className="type-caption text-muted max-w-[var(--container-text)]">
        {app.analytics.note}
      </p>

      <section aria-label={app.analytics.performance}>
        <h3 className="type-label text-accent">{app.analytics.performance}</h3>
        <div className="metric-grid">
          <MetricTile label={app.metrics.netPnl} value={formatSignedMoney(perf.netPnl, locale)} note={journal.insufficient} emphasis />
          <MetricTile label={app.metrics.averageR} value={formatR(perf.averageR)} note={journal.insufficient} />
          <MetricTile label={app.metrics.winRate} value={formatPercent(perf.winRate, locale)} note={app.minSample} />
          <MetricTile label={app.metrics.expectancy} value={formatSignedMoney(perf.expectancy, locale)} note={app.minSample} />
          <MetricTile label={app.metrics.wins} value={formatCount(perf.wins, locale)} />
          <MetricTile label={app.metrics.losses} value={formatCount(perf.losses, locale)} />
          <MetricTile label={app.metrics.breakeven} value={formatCount(perf.breakeven, locale)} />
          <MetricTile label={app.metrics.bestR} value={formatR(perf.bestR)} note={journal.insufficient} />
          <MetricTile label={app.metrics.worstR} value={formatR(perf.worstR)} note={journal.insufficient} />
          <MetricTile
            label={app.metrics.maxDrawdown}
            value={formatSignedMoney(perf.maxDrawdown === null ? null : -perf.maxDrawdown, locale)}
            note={journal.insufficient}
          />
        </div>
      </section>

      <section aria-label={app.analytics.process}>
        <h3 className="type-label text-accent">{app.analytics.process}</h3>
        <div className="metric-grid">
          <MetricTile label={app.metrics.adherence} value={formatPercent(proc.adherence, locale)} note={journal.insufficient} />
          <MetricTile label={app.metrics.reviewRate} value={formatPercent(proc.reviewRate, locale)} note={journal.insufficient} />
          <MetricTile label={app.metrics.sample} value={formatCount(perf.sample, locale)} />
          <MetricTile label={app.metrics.cancelled} value={formatCount(proc.cancelled, locale)} />
        </div>
      </section>

      <section aria-label={app.analytics.research} className="japp-columns">
        <UsageBars
          label={app.analytics.violations}
          locale={locale}
          emptyLabel={app.empty}
          rows={ruleViolations(trades).map((row) => ({
            id: row.id,
            label: app.review.rules[row.id as keyof typeof app.review.rules] ?? row.id,
            count: row.count,
          }))}
        />
        <UsageBars
          label={app.analytics.conceptUsage}
          locale={locale}
          emptyLabel={app.empty}
          rows={conceptUsage(trades).map((row) => ({
            id: row.id,
            label: concepts[row.id as TradingConceptId].term,
            count: row.count,
          }))}
        />
        <UsageBars
          label={app.analytics.setupUsage}
          locale={locale}
          emptyLabel={app.empty}
          rows={setupUsage(trades).map((row) => ({
            id: row.id,
            label: lab.items[row.id as keyof typeof lab.items]?.title ?? row.id,
            count: row.count,
          }))}
        />
      </section>
    </div>
  );
}
