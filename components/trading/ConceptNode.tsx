"use client";

import { useEffect, useId, useRef, useState } from "react";

import { track } from "@/lib/analytics";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { getConcept, type TradingConceptId } from "@/lib/trading/concepts";

/**
 * A CLICKABLE KNOWLEDGE NODE — master prompt §5, §14.
 *
 * The integration contract the Dictionary epic will consume, built now so the
 * concepts in this section are already addressable rather than being plain
 * words someone has to re-mark-up later.
 *
 * Three deliberate decisions:
 *
 * 1. **Click, never hover-only.** §14 forbids interaction that requires hover,
 *    and a hover tooltip is unreachable on touch and awkward on keyboard.
 *    Pointer users get the same affordance as everyone else.
 * 2. **The canonical id is in the DOM** as `data-concept`. That is what makes
 *    this a knowledge node rather than a tooltip: a future Dictionary, an
 *    analytics sink or an AI layer can find every occurrence of `liquidity`
 *    across the product without parsing display text, which differs by locale.
 * 3. **Definitions come from the dictionary, keyed by the concept id.** The
 *    component holds no prose, so a term is defined once for the whole
 *    product (§4).
 */

interface Props {
  id: TradingConceptId;
  concepts: Dictionary["concepts"];
  /** Where this node was rendered, for analytics. */
  surface: string;
}

export default function ConceptNode({ id, concepts, surface }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  const concept = getConcept(id);
  const copy = concepts[id];

  // Dismissal. Deliberately not the shared dismissable-layer hook: that one
  // traps focus and locks scrolling, which is right for a modal palette and
  // wrong for an inline definition the reader should be able to scroll past.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Focus returns to the trigger, not to the document body.
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

  return (
    <span className="concept" ref={rootRef} data-concept={id}>
      <button
        type="button"
        className="concept-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) track("concept_open", { id: `concept.${id}`, surface });
        }}
      >
        {copy.term}
        {/* Latin abbreviations stay Latin in Persian copy — MSS, BOS and FVG
            are written that way in Persian trading discourse (§12). */}
        {concept.abbr !== undefined ? (
          <span className="concept-abbr type-data" dir="ltr">
            {concept.abbr}
          </span>
        ) : null}
      </button>

      {open ? (
        <span id={panelId} role="tooltip" className="concept-panel">
          <span className="concept-panel-term type-label">{copy.term}</span>
          <span className="concept-panel-body type-caption">
            {copy.definition}
          </span>
        </span>
      ) : null}
    </span>
  );
}
