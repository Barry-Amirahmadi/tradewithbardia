"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { track } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { getConcept } from "@/lib/trading/concepts";
import {
  categories,
  dictionaryHref,
  publishedEntries,
  type ConceptCategory,
} from "@/lib/trading/dictionary";
import { normalise, scoreMatch } from "@/lib/search/provider";

/**
 * THE DICTIONARY LANDING — master prompt §10, §12.
 *
 * A knowledge interface: search first, categories second, the concepts
 * themselves grouped rather than dumped into a grid. Nineteen entries is small
 * enough that filtering happens locally against metadata already on the page —
 * no index to fetch, no request, and it works the moment the page is
 * interactive.
 *
 * Categories are **derived** from the entries (§6). This component names no
 * category; adding a concept in a new one makes the filter appear on its own,
 * and removing the last concept in a category makes it disappear.
 *
 * Search matches the term, the abbreviation, the aliases and the canonical id,
 * exactly like the command palette provider — the same rule in both places, so
 * a reader gets the same answer wherever they type.
 */

interface Props {
  locale: Locale;
  dict: Dictionary["dict"];
  concepts: Dictionary["concepts"];
}

export default function DictionaryBrowser({ locale, dict, concepts }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ConceptCategory | null>(null);

  const groups = useMemo(() => categories(), []);

  const visible = useMemo(() => {
    const needle = normalise(query);
    return publishedEntries
      .filter((entry) => category === null || entry.category === category)
      .map((entry) => {
        const concept = getConcept(entry.conceptId);
        const copy = concepts[entry.conceptId];
        if (needle === "") return { entry, score: 1 };
        const candidates = [copy.term, concept.abbr ?? "", entry.conceptId, ...entry.aliases];
        const score = Math.max(...candidates.map((c) => (c ? scoreMatch(c, query) : 0)));
        return { entry, score };
      })
      .filter(({ score }) => score > 0);
  }, [query, category, concepts]);

  return (
    <div className="dict-browser">
      <div className="dict-controls">
        <label className="dict-search">
          <span className="sr-only">{dict.searchLabel}</span>
          <input
            type="search"
            value={query}
            placeholder={dict.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              // A query is reported as a length, never as text — the rule the
              // command palette follows, applied here too.
              track("dictionary_search", {
                surface: "dictionary",
                queryLength: event.target.value.length,
              });
            }}
          />
        </label>

        <fieldset className="dict-categories">
          <legend className="sr-only">{dict.categoriesLabel}</legend>
          <label className="dict-chip">
            <input
              type="radio"
              name="category"
              checked={category === null}
              onChange={() => setCategory(null)}
            />
            <span>{dict.allCategories}</span>
          </label>
          {groups.map(({ id, count }) => (
            <label key={id} className="dict-chip">
              <input
                type="radio"
                name="category"
                checked={category === id}
                onChange={() => setCategory(id)}
              />
              <span>
                {dict.categories[id]}
                <span className="dict-chip-count type-data">{count}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <p className="type-caption text-secondary" role="status" aria-live="polite">
        {visible.length === 1
          ? dict.resultsOne
          : dict.resultsMany.replace("{n}", String(visible.length))}
      </p>

      {visible.length === 0 ? (
        <p className="dict-empty type-lead">{dict.empty}</p>
      ) : (
        <ul className="dict-list">
          {visible.map(({ entry }) => {
            const concept = getConcept(entry.conceptId);
            const copy = concepts[entry.conceptId];
            return (
              <li key={entry.conceptId}>
                <Link
                  href={dictionaryHref(locale, entry.conceptId)}
                  className="dict-entry"
                  data-concept={entry.conceptId}
                  onClick={() =>
                    track("dictionary_term_open", {
                      id: `concept.${entry.conceptId}`,
                      surface: "dictionary",
                    })
                  }
                >
                  <span className="dict-entry-head">
                    <span className="type-h3">{copy.term}</span>
                    {concept.abbr !== undefined ? (
                      <span className="dict-entry-abbr type-data" dir="ltr">
                        {concept.abbr}
                      </span>
                    ) : null}
                    <span className="dict-entry-category type-caption">
                      {dict.categories[entry.category]}
                    </span>
                  </span>
                  {/* The short definition, which is the canonical one. The
                      full explanation lives on the term page. */}
                  <span className="dict-entry-def text-secondary">
                    {copy.definition}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
