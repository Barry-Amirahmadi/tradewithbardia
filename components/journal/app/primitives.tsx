"use client";

import type { Locale } from "@/lib/i18n/config";
import { NO_VALUE } from "@/lib/journal/format";

/**
 * DASHBOARD PRIMITIVES — master prompt §30, §32.
 *
 * CSS and SVG, no chart library and no renderer. A metric tile is a number and
 * a label; a distribution is a row of proportional bars. Reaching for the
 * visualization façade here would mount a canvas per widget for pictures that
 * HTML draws natively — §30 rules that out, and there is nothing a chart
 * engine would add.
 *
 * `null` is the insufficient-data state and is rendered differently from zero,
 * everywhere. A tile that shows "—" with a reason is honest; one that shows
 * "0%" for a metric that could not be computed is not.
 */

export function MetricTile({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  const missing = value === NO_VALUE;
  return (
    <div className="metric" data-missing={missing} data-emphasis={emphasis}>
      <p className="metric-label type-label">{label}</p>
      <p className="metric-value type-data" dir="ltr">
        {value}
      </p>
      {/* Present only when the figure is absent: the reader is told why, not
          left to guess whether the number is zero or unknown. */}
      {note !== undefined && missing ? (
        <p className="metric-note type-caption">{note}</p>
      ) : null}
    </div>
  );
}

export function UsageBars({
  rows,
  label,
  locale,
  emptyLabel,
}: {
  rows: readonly { id: string; label: string; count: number }[];
  label: string;
  locale: Locale;
  emptyLabel: string;
}) {
  const max = rows.reduce((n, row) => Math.max(n, row.count), 0);

  return (
    <section className="usage">
      <h3 className="type-label text-accent">{label}</h3>
      {rows.length === 0 ? (
        <p className="type-caption text-muted">{emptyLabel}</p>
      ) : (
        <ul className="usage-list">
          {rows.map((row) => (
            <li key={row.id} data-concept={row.id}>
              <span className="usage-name">{row.label}</span>
              <span className="usage-bar" aria-hidden="true">
                <span style={{ inlineSize: `${max === 0 ? 0 : (row.count / max) * 100}%` }} />
              </span>
              <span className="usage-count type-data" dir="ltr">
                {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(row.count)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Outcome and status pills. Never green-for-good — see the note below. */
export function Pill({ kind, children }: { kind: string; children: React.ReactNode }) {
  return (
    <span className="pill" data-kind={kind}>
      {children}
    </span>
  );
}
