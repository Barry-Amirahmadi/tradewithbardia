"use client";

import { useState } from "react";

import { Pill } from "./primitives";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { closedTrades, isReviewed, outcome, rMultiple } from "@/lib/journal/calculations";
import { formatDate, formatR } from "@/lib/journal/format";
import {
  adherenceStates,
  type Adherence,
  type StoredTrade,
  type TradeReview,
} from "@/lib/journal/trade";
import type { TradingConceptId } from "@/lib/trading/concepts";

/**
 * THE REVIEW EXPERIENCE — master prompt §9, §10, §35.
 *
 * Four questions, not a form with forty fields. Each names a dimension of the
 * process and is answered with an adherence state rather than free text, which
 * is what turns a review into data the analytics layer can aggregate.
 *
 * The rule ids are stable strings, and that is deliberate: today they are the
 * four review dimensions, and when setups gain machine-checkable conditions
 * the same `RuleCheck` shape carries a generated rule with the same states.
 * Nothing here needs to change for that (§10).
 *
 * The concept tags are canonical ids, so "which concepts show up when I break
 * my rules?" becomes answerable from records rather than from memory.
 */

const RULE_IDS = ["context", "setup", "execution", "risk"] as const;

/** Concepts a reviewer is most likely to reach for. Canonical ids, not labels. */
const REVIEW_CONCEPTS: readonly TradingConceptId[] = [
  "context", "liquidity", "structure", "setup",
  "execution", "risk", "invalidation", "positionSize",
];

export default function ReviewView({
  locale,
  trades,
  journal,
  concepts,
  onSave,
}: {
  locale: Locale;
  trades: readonly StoredTrade[];
  journal: Dictionary["journal"];
  concepts: Dictionary["concepts"];
  onSave: (id: string, review: TradeReview) => Promise<void>;
}) {
  const app = journal.app;
  const queue = closedTrades(trades).filter((trade) => !isReviewed(trade));
  const [active, setActive] = useState<string | null>(null);
  const [rules, setRules] = useState<Record<string, Adherence>>({});
  const [tagged, setTagged] = useState<readonly TradingConceptId[]>([]);
  const [lessons, setLessons] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const start = (id: string) => {
    setActive(id);
    setRules(Object.fromEntries(RULE_IDS.map((r) => [r, "unknown" as Adherence])));
    setTagged([]);
    setLessons("");
    setSaved(null);
  };

  const submit = async () => {
    if (active === null) return;
    await onSave(active, {
      rules: RULE_IDS.map((id) => ({ id, adherence: rules[id] ?? "unknown" })),
      conceptIds: tagged,
      lessons: lessons.trim() === "" ? undefined : lessons.trim(),
      reviewedAt: new Date().toISOString(),
    });
    setSaved(active);
    setActive(null);
  };

  return (
    <div className="japp-view">
      <h2 className="type-h3">{app.review.title}</h2>
      <p className="type-lead max-w-[var(--container-text)]">{app.review.lead}</p>

      {saved !== null ? (
        <p className="japp-saved type-caption" role="status">{app.review.saved}</p>
      ) : null}

      {queue.length === 0 ? (
        <p className="type-lead text-muted">{app.review.queueEmpty}</p>
      ) : (
        <ul className="japp-list">
          {queue.map((trade) => {
            const result = outcome(trade);
            return (
              <li key={trade.id}>
                <button type="button" onClick={() => start(trade.id)}>
                  <span className="japp-list-main">{formatDate(trade.openedAt, locale)}</span>
                  {result !== null ? <Pill kind={result}>{app.outcomes[result]}</Pill> : null}
                  <span className="type-data" dir="ltr">{formatR(rMultiple(trade))}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {active !== null ? (
        <form
          className="japp-review-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {RULE_IDS.map((id) => (
            <fieldset key={id} className="japp-rule">
              <legend>{app.review.rules[id]}</legend>
              <div className="japp-rule-options">
                {adherenceStates.map((state) => (
                  <label key={state} className="japp-chip">
                    <input
                      type="radio"
                      name={id}
                      checked={rules[id] === state}
                      onChange={() => setRules((current) => ({ ...current, [id]: state }))}
                    />
                    <span>{app.review.adherence[state]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <fieldset className="japp-rule">
            <legend>{app.review.conceptsLabel}</legend>
            <div className="japp-rule-options">
              {REVIEW_CONCEPTS.map((id) => (
                <label key={id} className="japp-chip" data-concept={id}>
                  <input
                    type="checkbox"
                    checked={tagged.includes(id)}
                    onChange={() =>
                      setTagged((current) =>
                        current.includes(id)
                          ? current.filter((c) => c !== id)
                          : [...current, id],
                      )
                    }
                  />
                  <span>{concepts[id].term}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="japp-field">
            <span className="type-label">{app.detail.notes}</span>
            <textarea
              rows={3}
              value={lessons}
              onChange={(event) => setLessons(event.target.value)}
            />
          </label>

          <div className="japp-header-actions">
            <button type="submit" className="btn btn-primary">{app.review.save}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setActive(null)}>
              {app.detail.close}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
