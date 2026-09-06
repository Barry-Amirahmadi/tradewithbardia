"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { getConcept, type TradingConceptId } from "@/lib/trading/concepts";
import { dictionaryHref, getEntry } from "@/lib/trading/dictionary";

/**
 * THE CONTEXTUAL CONCEPT REFERENCE — master prompt §13, §14, §21, §22.
 *
 * The inline mechanism every surface uses to point at a canonical concept.
 * Introduced in EPIC 04 as a click-only definition chip; EPIC 07 makes it the
 * entry point to the Dictionary.
 *
 * Four properties, each deliberate:
 *
 * 1. **Identity is `TradingConceptId`, never display text.** The component is
 *    given an id and looks up its own copy, so the same reference works in
 *    English, Persian and any future locale without the call site changing.
 * 2. **Hover is an enhancement, never the mechanism.** Pointer devices get a
 *    hover card with a short grace period; touch and keyboard get the same
 *    card from a tap or Enter. Nothing is reachable only by hovering (§13,
 *    §22, §31).
 * 3. **The card is brief on purpose.** Title, short definition, and a way to
 *    the full entry. The hover card is not the Dictionary (§21).
 * 4. **No second overlay system.** This is a local disclosure, not a modal —
 *    it must not trap focus or lock scrolling, which is exactly why it does
 *    not use `useDismissableLayer`. That hook is correct for the command
 *    palette and wrong for an inline definition the reader scrolls past.
 */

/** Grace so a diagonal mouse path from the chip to the card does not close it. */
const CLOSE_DELAY = 140;

interface Props {
  id: TradingConceptId;
  concepts: Dictionary["concepts"];
  locale: Locale;
  dict: Dictionary["dict"];
  /** Where this node was rendered, for analytics. */
  surface: string;
}

export default function ConceptNode({ id, concepts, locale, dict, surface }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | null>(null);
  const panelId = useId();

  const concept = getConcept(id);
  const copy = concepts[id];
  // A concept with no published entry still explains itself; it just has
  // nowhere deeper to send the reader.
  const href = getEntry(id) !== undefined ? dictionaryHref(locale, id) : null;

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      rootRef.current?.querySelector("button")?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) === true) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const reveal = () => {
    if (open) return;
    setOpen(true);
    track("concept_open", { id: `concept.${id}`, surface });
  };

  return (
    <span
      className="concept"
      ref={rootRef}
      data-concept={id}
      onPointerEnter={(event) => {
        // Mouse only. On touch, `pointerenter` fires immediately before the
        // click that toggles, so opening here would make a tap read as
        // "already open" and close it again.
        if (event.pointerType !== "mouse") return;
        cancelClose();
        reveal();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        scheduleClose();
      }}
    >
      <button
        type="button"
        className="concept-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? setOpen(false) : reveal())}
      >
        {copy.term}
        {/* Latin abbreviations stay Latin in Persian copy — MSS, BOS and FVG
            are written that way in Persian trading discourse. */}
        {concept.abbr !== undefined ? (
          <span className="concept-abbr type-data" dir="ltr">
            {concept.abbr}
          </span>
        ) : null}
      </button>

      {open ? (
        // Not `role="tooltip"`: this card contains a link, and a tooltip that
        // holds interactive content is unreachable for assistive technology.
        // A disclosure named by its trigger is the honest description.
        <span id={panelId} className="concept-panel">
          <span className="concept-panel-term type-label">{copy.term}</span>
          <span className="concept-panel-body type-caption">{copy.definition}</span>
          {href !== null ? (
            <Link
              href={href}
              className="concept-panel-link type-caption"
              onClick={() =>
                track("dictionary_term_open", { id: `concept.${id}`, surface })
              }
            >
              {dict.openDictionary} →
            </Link>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
