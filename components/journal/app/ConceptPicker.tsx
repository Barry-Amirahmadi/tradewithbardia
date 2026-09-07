"use client";

import { useId, useMemo, useRef, useState } from "react";

import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { tradingConceptIds, type TradingConceptId } from "@/lib/trading/concepts";

/**
 * CONCEPT TAGGING — master prompt §14, §15, §38.
 *
 * Not a generic tag input. §15 is explicit that the question being asked is
 * "which concepts were actually involved in this trade?", and the interface
 * should ask it — a free-text tag field would invite `liqudity`, `Liquidity`
 * and `liquidity sweep` as three different strings, and the entire premise of
 * the concept model is that there is exactly one identity per idea.
 *
 * So the only values that exist are the canonical ones. The user searches the
 * twenty concepts the rest of the product already teaches, and what gets
 * stored is a `TradingConceptId` — never the display string, which differs by
 * locale and would split one concept into two.
 *
 * ACCESSIBILITY (§38). This is the ARIA combobox-with-listbox pattern:
 * `aria-expanded`, `aria-controls` and `aria-activedescendant` on the input,
 * `role="option"` with `aria-selected` on each row. Arrow keys move without
 * moving focus, Enter commits, Escape closes, and Backspace on an empty input
 * removes the last chip. Every selected concept has a real remove button, so
 * nothing here needs a mouse — and none of it is conveyed by colour alone.
 */

interface Props {
  value: readonly TradingConceptId[];
  onChange: (next: readonly TradingConceptId[]) => void;
  concepts: Dictionary["concepts"];
  copy: Dictionary["journal"]["app"]["picker"];
  /** Associates the group with its field label for screen readers. */
  labelledBy?: string;
}

export default function ConceptPicker({ value, onChange, concepts, copy, labelledBy }: Props) {
  const listId = useId();
  const optionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Matching is on the localized term, because that is what the user is
  // reading, plus the id, so someone who knows the canonical name can type it.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tradingConceptIds.filter((id) => {
      if (value.includes(id)) return false;
      if (needle === "") return true;
      return (
        concepts[id].term.toLowerCase().includes(needle) ||
        id.toLowerCase().includes(needle)
      );
    });
  }, [query, value, concepts]);

  const add = (id: TradingConceptId) => {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setQuery("");
    setActive(0);
    // Focus stays in the input so several concepts can be added in a row
    // without reaching for the mouse between each.
    inputRef.current?.focus();
  };

  const remove = (id: TradingConceptId) => {
    onChange(value.filter((current) => current !== id));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (matches.length === 0) return;
      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return (next + matches.length) % matches.length;
      });
      return;
    }
    if (event.key === "Enter") {
      // Only swallow Enter when it is actually choosing something — otherwise
      // it must still reach the form and submit it.
      const choice = open ? matches[active] : undefined;
      if (choice !== undefined) {
        event.preventDefault();
        add(choice);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Backspace" && query === "") {
      const last = value[value.length - 1];
      if (last !== undefined) remove(last);
    }
  };

  return (
    <div className="jpicker">
      <p className="type-caption text-muted">{copy.question}</p>

      {/* Selected first: the answer to the question is the important part, and
          it stays visible while the search field is being used. */}
      <ul className="jpicker-selected" aria-label={copy.selected}>
        {value.length === 0 ? (
          <li className="type-caption text-muted">{copy.empty}</li>
        ) : (
          value.map((id) => (
            <li key={id} data-concept={id}>
              <span>{concepts[id].term}</span>
              <button
                type="button"
                onClick={() => remove(id)}
                aria-label={`${copy.remove}: ${concepts[id].term}`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="jpicker-search">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-labelledby={labelledBy}
          aria-activedescendant={
            open && matches[active] !== undefined ? `${optionId}-${active}` : undefined
          }
          placeholder={copy.search}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          // A blur that lands on an option must not close the list before the
          // click registers, so the close is deferred one tick.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        <p className="type-caption text-muted">{copy.searchHint}</p>

        {open ? (
          <ul className="jpicker-options" id={listId} role="listbox" aria-label={copy.search}>
            {matches.length === 0 ? (
              <li className="type-caption text-muted">{copy.noMatch}</li>
            ) : (
              matches.map((id, index) => (
                <li
                  key={id}
                  id={`${optionId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  data-concept={id}
                >
                  {/* A real button, so touch and keyboard both work and the
                      target is large enough on a phone (§37). */}
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(id)}>
                    {concepts[id].term}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
