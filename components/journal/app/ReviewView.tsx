"use client";

import { useState } from "react";

import ConceptPicker from "./ConceptPicker";
import { Pill } from "./primitives";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { closedTrades, outcome, rMultiple } from "@/lib/journal/calculations";
import { formatDate, formatR } from "@/lib/journal/format";
import {
  adherenceStates,
  reviewState,
  type Adherence,
  type StoredTrade,
  type TradeReview,
} from "@/lib/journal/trade";
import type { TradingConceptId } from "@/lib/trading/concepts";

/**
 * THE REVIEW EXPERIENCE — master prompt §16, §17, §18, §19, §20.
 *
 * A debrief, not a form (§17). Four questions about the process, two about
 * what actually happened, and none of them mandatory — a review that cannot
 * be saved until every box is filled is a review that does not get done.
 *
 * FOUR RULE DIMENSIONS, NOT A SECOND ENGINE (§18). The existing `RuleCheck`
 * shape and the four EPIC 08 dimensions carry straight through. Setup-specific
 * rules will be additional `RuleCheck`s with the same states and the same
 * storage; nothing here needs to change to accommodate them, which is why no
 * parallel structure was introduced.
 *
 * COMPLETION IS DECLARED, NEVER INFERRED (§19). Opening a trade does not start
 * a review, and filling in three of four answers does not finish one. "Save as
 * draft" writes `complete: false` and the trade stays in the queue; "Save
 * review" writes a complete review. The application never decides on the
 * user's behalf that they are done thinking.
 *
 * REVIEWS ARE EDITABLE (§20). A judgement made the evening of a trade is often
 * wrong a month later, and a journal that locks the first answer is a journal
 * that preserves mistakes. Editing goes through the same repository call as
 * creating — there is one persistence path.
 */

const RULE_IDS = ["context", "setup", "execution", "risk"] as const;

function blankRules(): Record<string, Adherence> {
  return Object.fromEntries(RULE_IDS.map((id) => [id, "unknown" as Adherence]));
}

/**
 * The debrief form for one trade.
 *
 * Split out and mounted with `key={trade.id}` so its state initialises from
 * props on the way in. The alternative — an effect copying the trade's review
 * into state — is derived state pretending to be synchronisation, and it
 * cascades a render every time the repository notifies. Remounting on identity
 * change is the React answer, and it makes "open a different trade" impossible
 * to get subtly wrong.
 */
function ReviewForm({
  trade,
  locale,
  app,
  concepts,
  onSave,
  onClose,
}: {
  trade: StoredTrade;
  locale: Locale;
  app: Dictionary["journal"]["app"];
  concepts: Dictionary["concepts"];
  onSave: (id: string, review: TradeReview) => Promise<void>;
  onClose: () => void;
}) {
  const existing = trade.review;

  // Editing loads the existing answers. Starting fresh loads "unknown", which
  // is a real answer meaning "I did not judge this" — not a default that
  // quietly counts as followed.
  const [rules, setRules] = useState<Record<string, Adherence>>(() =>
    existing === undefined
      ? blankRules()
      : { ...blankRules(), ...Object.fromEntries(existing.rules.map((r) => [r.id, r.adherence])) },
  );
  const [tagged, setTagged] = useState<readonly TradingConceptId[]>(existing?.conceptIds ?? []);
  const [observations, setObservations] = useState(existing?.observations ?? "");
  const [lessons, setLessons] = useState(existing?.lessons ?? "");

  const submit = async (complete: boolean) => {
    const trimmed = (value: string) => (value.trim() === "" ? undefined : value.trim());
    await onSave(trade.id, {
      rules: RULE_IDS.map((id) => ({ id, adherence: rules[id] ?? "unknown" })),
      conceptIds: tagged,
      observations: trimmed(observations),
      lessons: trimmed(lessons),
      reviewedAt: new Date().toISOString(),
      complete,
    });
    onClose();
  };

  return (
    <form
      className="japp-review-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(true);
      }}
    >
      <h3 className="type-h3">{formatDate(trade.openedAt, locale)}</h3>

      {RULE_IDS.map((id) => (
        <fieldset key={id} className="japp-rule">
          <legend>{app.review.rules[id]}</legend>
          <div className="japp-rule-options">
            {adherenceStates.map((state) => (
              <label key={state} className="japp-chip">
                <input
                  type="radio"
                  name={`${trade.id}-${id}`}
                  checked={rules[id] === state}
                  onChange={() => setRules((current) => ({ ...current, [id]: state }))}
                />
                <span>{app.review.adherence[state]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {/* The same canonical picker the capture form uses. Two different concept
          selectors would be two chances to store a display string instead of
          an id. */}
      <fieldset className="japp-rule">
        <legend>{app.review.conceptsLabel}</legend>
        <ConceptPicker
          value={tagged}
          onChange={setTagged}
          concepts={concepts}
          copy={app.picker}
        />
      </fieldset>

      <label className="japp-field">
        <span className="type-label">{app.detail.outcome}</span>
        <textarea
          rows={3}
          value={observations}
          onChange={(event) => setObservations(event.target.value)}
        />
      </label>

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
        {/* Explicitly not the same thing as finishing (§19). */}
        <button type="button" className="btn btn-ghost" onClick={() => void submit(false)}>
          {app.reviewStates.inReview}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {app.capture.cancel}
        </button>
      </div>
    </form>
  );
}

export default function ReviewView({
  locale,
  trades,
  journal,
  concepts,
  initialTradeId,
  onSave,
}: {
  locale: Locale;
  trades: readonly StoredTrade[];
  journal: Dictionary["journal"];
  concepts: Dictionary["concepts"];
  /** Set when the user arrived here from a trade's Review action. */
  initialTradeId?: string | null;
  onSave: (id: string, review: TradeReview) => Promise<void>;
}) {
  const app = journal.app;

  // The queue is closed trades whose review is not finished — which now
  // includes drafts, so an abandoned half-review comes back rather than
  // disappearing into a "reviewed" count it never earned.
  const queue = closedTrades(trades).filter((trade) => reviewState(trade) !== "reviewed");
  const done = trades.filter((trade) => reviewState(trade) === "reviewed");

  /**
   * `undefined` means "the user has not chosen yet", so the trade addressed by
   * the URL wins. Any explicit choice — including closing the form, which sets
   * null — overrides it from then on. Derived during render rather than synced
   * by an effect, which is what React's own guidance and the lint rule both
   * ask for.
   */
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const activeId = chosen === undefined ? initialTradeId ?? null : chosen;
  const trade = activeId === null ? undefined : trades.find((t) => t.id === activeId);

  const row = (item: StoredTrade) => {
    const result = outcome(item);
    const state = reviewState(item);
    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setChosen(item.id);
          }}
        >
          <span className="japp-list-main">{formatDate(item.openedAt, locale)}</span>
          {result !== null ? <Pill kind={result}>{app.outcomes[result]}</Pill> : null}
          <Pill kind={state}>{app.reviewStates[state]}</Pill>
          <span className="type-data" dir="ltr">{formatR(rMultiple(item))}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="japp-view">
      <h2 className="type-h3">{app.review.title}</h2>
      <p className="type-lead max-w-[var(--container-text)]">{app.review.lead}</p>

      {saved ? (
        <p className="japp-saved type-caption" role="status">{app.review.saved}</p>
      ) : null}

      <section>
        <h3 className="type-label text-accent">{app.dashboard.queue}</h3>
        {queue.length === 0 ? (
          <p className="type-lead text-muted">{app.review.queueEmpty}</p>
        ) : (
          <ul className="japp-list">{queue.map(row)}</ul>
        )}
      </section>

      {/* Completed reviews stay reachable, because §20 requires they can be
          revised — and because rereading old reviews is most of the value. */}
      {done.length > 0 ? (
        <section>
          <h3 className="type-label text-accent">{app.reviewStates.reviewed}</h3>
          <ul className="japp-list">{done.map(row)}</ul>
        </section>
      ) : null}

      {trade !== undefined ? (
        <ReviewForm
          key={trade.id}
          trade={trade}
          locale={locale}
          app={app}
          concepts={concepts}
          onSave={async (id, review) => {
            await onSave(id, review);
            setSaved(true);
          }}
          onClose={() => setChosen(null)}
        />
      ) : null}
    </div>
  );
}
