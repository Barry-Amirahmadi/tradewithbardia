"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import SetupPreview from "./SetupPreview";
import { track } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import {
  filterDimensions,
  filterSetups,
  setups,
  type Setup,
  type SetupQuery,
} from "@/lib/trading/setups";

/**
 * THE LIBRARY — master prompt §6, §14, §16.
 *
 * A research index, not a product grid: no prices, no ratings, no badges
 * implying performance, and every card states what is known about the setup
 * rather than what it might earn.
 *
 * Filtering is client state because it is an interaction, and the dataset it
 * operates on is **route-scoped** — this component only exists on `/setups`,
 * so the setup metadata never reaches any other page (§2). The copy arrives
 * as props from the server page for the same reason.
 *
 * Filter dimensions are DERIVED (§14): `filterDimensions()` reads the data and
 * omits any dimension with fewer than two distinct values, so this component
 * hardcodes no instrument, session or timeframe. Adding a setup that trades a
 * new session makes the option appear on its own.
 */

interface Props {
  locale: Locale;
  lab: Dictionary["lab"];
  concepts: Dictionary["concepts"];
}

type DimensionId = ReturnType<typeof filterDimensions>[number]["id"];

export default function SetupLibrary({ locale, lab, concepts }: Props) {
  const [query, setQuery] = useState<SetupQuery>({});

  const dimensions = useMemo(() => filterDimensions(), []);
  const visible = useMemo(() => filterSetups(query), [query]);
  const active = Object.values(query).filter((v) => v !== undefined).length;

  const label = (dimension: DimensionId, value: string): string => {
    if (dimension === "instrument") return lab.instruments[value as keyof typeof lab.instruments] ?? value;
    if (dimension === "session") return lab.sessions[value as keyof typeof lab.sessions] ?? value;
    if (dimension === "timeframe") return lab.timeframes[value as keyof typeof lab.timeframes] ?? value;
    if (dimension === "difficulty") return lab.difficulties[value as keyof typeof lab.difficulties] ?? value;
    return concepts[value as keyof typeof concepts]?.term ?? value;
  };

  const select = (dimension: DimensionId, value: string | undefined) => {
    setQuery((current) => ({ ...current, [dimension]: value }));
    if (value !== undefined) {
      track("setup_filter", { id: `filter.${dimension}.${value}`, surface: "setup-lab" });
    }
  };

  return (
    <div className="setup-lab">
      {/*
        A real <fieldset> per dimension rather than a custom listbox: radio
        groups already give arrow-key navigation, a group label and correct
        announcement, and none of that has to be rebuilt or kept correct.
      */}
      <form
        className="setup-filters"
        aria-label={lab.filtersLabel}
        onSubmit={(event) => event.preventDefault()}
      >
        {dimensions.map((dimension) => (
          <fieldset key={dimension.id} className="setup-filter">
            <legend className="type-label">{lab.dimensions[dimension.id]}</legend>
            <div className="setup-filter-options">
              <label className="setup-chip">
                <input
                  type="radio"
                  name={dimension.id}
                  checked={query[dimension.id] === undefined}
                  onChange={() => select(dimension.id, undefined)}
                />
                <span>{lab.all}</span>
              </label>
              {dimension.values.map(({ value, count }) => (
                <label key={value} className="setup-chip">
                  <input
                    type="radio"
                    name={dimension.id}
                    checked={query[dimension.id] === value}
                    onChange={() => select(dimension.id, value)}
                  />
                  <span>
                    {label(dimension.id, value)}
                    <span className="setup-chip-count type-data">{count}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </form>

      <div className="setup-results">
        {/* Announced politely so a filter change is heard without stealing
            focus from the control that caused it. */}
        <p className="type-caption text-secondary" role="status" aria-live="polite">
          {visible.length === 1
            ? lab.resultsOne
            : lab.resultsMany.replace("{n}", String(visible.length))}
          {active > 0 ? (
            <button type="button" className="setup-clear" onClick={() => setQuery({})}>
              {lab.clear}
            </button>
          ) : null}
        </p>

        {visible.length === 0 ? (
          <p className="setup-empty type-lead">{lab.empty}</p>
        ) : (
          <ul className="setup-grid">
            {visible.map((setup) => (
              <li key={setup.id}>
                <SetupCard locale={locale} setup={setup} lab={lab} concepts={concepts} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SetupCard({
  locale,
  setup,
  lab,
  concepts,
}: {
  locale: Locale;
  setup: Setup;
  lab: Dictionary["lab"];
  concepts: Dictionary["concepts"];
}) {
  const copy = lab.items[setup.id as keyof typeof lab.items];
  if (copy === undefined) return null;

  return (
    <article className="setup-card">
      <Link
        href={`/${locale}/setups/${setup.slug}`}
        className="setup-card-link"
        onClick={() => track("setup_open", { id: `setup.${setup.slug}`, surface: "setup-lab" })}
      >
        <SetupPreview setup={setup} />
        <h3 className="setup-card-title type-h3">{copy.title}</h3>
      </Link>

      <p className="setup-card-purpose text-secondary">{copy.purpose}</p>

      {/* Evidence, never performance. This is the only status a card carries,
          and it says what is NOT known as clearly as what is (§5, §7). */}
      <p className="setup-evidence" data-evidence={setup.evidence.kind}>
        <span className="type-label">{lab.evidenceShort[setup.evidence.kind]}</span>
      </p>

      <ul className="setup-meta type-caption">
        {setup.instruments.map((v) => (
          <li key={`i-${v}`}>{lab.instruments[v]}</li>
        ))}
        {setup.sessions.map((v) => (
          <li key={`s-${v}`}>{lab.sessions[v]}</li>
        ))}
        {setup.timeframes.map((v) => (
          <li key={`t-${v}`} dir="ltr">
            {lab.timeframes[v]}
          </li>
        ))}
        <li>{lab.difficulties[setup.difficulty]}</li>
      </ul>

      {/* Canonical concept ids in the DOM, same contract as ConceptNode — the
          Dictionary and a future AI layer can find every reference without
          parsing locale-dependent display text (EPIC 04 §5). */}
      <ul className="setup-concepts type-caption">
        {setup.conceptIds.slice(0, 4).map((id) => (
          <li key={id} data-concept={id}>
            {concepts[id].term}
          </li>
        ))}
      </ul>
    </article>
  );
}
