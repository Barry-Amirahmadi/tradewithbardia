"use client";

import { useId, useMemo, useRef, useState } from "react";

import ConceptPicker from "./ConceptPicker";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import {
  parseDecimal,
  requiredDraftFields,
  type TradeDraft,
} from "@/lib/journal/draft";
import { formatR } from "@/lib/journal/format";
import { ratioToBasisPoints } from "@/lib/journal/money";
import {
  tradeDirections,
  tradeInstruments,
  tradeSessions,
  tradeStatuses,
  tradeTimeframes,
  type IssueCode,
  type ValidationIssue,
} from "@/lib/journal/trade";
import type { JournalLab } from "@/lib/journal/lab-view";
import { setups } from "@/lib/trading/setups";

/**
 * TRADE CAPTURE AND EDIT — master prompt §5, §6, §7, §8, §9, §37, §38.
 *
 * ONE FORM, BOTH JOBS. Creating and editing are the same component with a
 * different starting draft, because §6 requires that a trade cannot become
 * invalid by being edited through a different screen. Two forms would mean two
 * sets of rules, and the second one would be the one that rots.
 *
 * WHAT IT DOES NOT ASK FOR (§7). No P&L, no R multiple, no win/loss selector.
 * Those are derived, and the "Calculated for you" panel below states that
 * plainly rather than leaving the user to wonder where the numbers come from.
 * Planned R is shown live from entry, stop and target — as a demonstration
 * that the arithmetic is real, and as "—" the moment its inputs are not there.
 *
 * SECTIONS, NOT A WALL (§7, §37). Six groups following the shape of a trade.
 * On a phone they stack and the save bar sticks to the bottom of the viewport,
 * so the primary action never ends up below a virtual keyboard.
 *
 * ERRORS (§9, §38). Nothing is validated while typing — that produces a form
 * that shouts at you for a half-entered price. Validation runs on submit, the
 * summary is focused so a screen reader announces it, each message is tied to
 * its input with `aria-describedby` and `aria-invalid`, and every message is
 * real text rather than a red outline.
 */

interface Props {
  mode: "create" | "edit";
  initial: TradeDraft;
  issues: readonly ValidationIssue[];
  locale: Locale;
  journal: Dictionary["journal"];
  lab: JournalLab;
  concepts: Dictionary["concepts"];
  onSubmit: (draft: TradeDraft) => void;
  onCancel: () => void;
}

export default function TradeForm({
  mode,
  initial,
  issues,
  journal,
  lab,
  concepts,
  onSubmit,
  onCancel,
}: Props) {
  const app = journal.app;
  const copy = app.capture;
  const fieldId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState<TradeDraft>(initial);

  const set = <K extends keyof TradeDraft>(key: K, value: TradeDraft[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      // Leaving `closed` clears the outcome. The domain forbids an exit on a
      // trade that is not closed, so keeping the value would guarantee a
      // validation error the user did not cause and cannot see the source of.
      if (key === "status" && value !== "closed") {
        next.exit = "";
        next.closedAt = "";
      }
      return next;
    });
  };

  const errorFor = (field: string): ValidationIssue | undefined =>
    issues.find((issue) => issue.field === field);

  const message = (code: IssueCode): string => app.errors[code];

  const required = (field: string): boolean =>
    (requiredDraftFields as readonly string[]).includes(field);

  /**
   * Planned reward-to-risk, live.
   *
   * Recomputed from the three strings rather than mirrored into state, so it
   * cannot fall out of step with the inputs. Null the moment any of them is
   * missing or unparseable — the same "absence is not zero" rule the dashboard
   * follows, applied while the user is still typing.
   */
  const previewR = useMemo(() => {
    const entry = parseDecimal(draft.entry);
    const stop = parseDecimal(draft.stop);
    const target = parseDecimal(draft.target);
    if (entry === null || stop === null || target === null) return null;
    const risked = Math.abs(entry - stop);
    if (risked === 0) return null;
    const reward = draft.direction === "long" ? target - entry : entry - target;
    return ratioToBasisPoints(reward, risked);
  }, [draft.entry, draft.stop, draft.target, draft.direction]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(draft);
    // Focus moves to the summary only if the parent rejects the draft, which
    // it signals by leaving `issues` non-empty on the next render.
    window.setTimeout(() => summaryRef.current?.focus(), 0);
  };

  /** A labelled text input with its error wired up. */
  const field = (
    name: keyof TradeDraft & string,
    type: "text" | "datetime-local",
    hint?: string,
  ) => {
    const issue = errorFor(name);
    const id = `${fieldId}-${name}`;
    const describedBy = [
      issue !== undefined ? `${id}-error` : null,
      hint !== undefined ? `${id}-hint` : null,
    ].filter((v): v is string => v !== null).join(" ");

    return (
      <div className="japp-field" data-invalid={issue !== undefined}>
        <label htmlFor={id}>
          <span className="type-label">{copy.fields[name as keyof typeof copy.fields]}</span>
          <span className="japp-req type-caption">
            {required(name) ? copy.required : copy.optional}
          </span>
        </label>
        <input
          id={id}
          name={name}
          type={type}
          // `inputMode` rather than `type="number"`: a number input silently
          // discards text the browser dislikes, which would hide exactly the
          // malformed input §9 requires be reported.
          inputMode={type === "text" ? "decimal" : undefined}
          value={draft[name] as string}
          onChange={(event) => set(name, event.target.value as TradeDraft[typeof name])}
          aria-invalid={issue !== undefined}
          aria-describedby={describedBy === "" ? undefined : describedBy}
        />
        {hint !== undefined ? (
          <p id={`${id}-hint`} className="type-caption text-muted">{hint}</p>
        ) : null}
        {issue !== undefined ? (
          <p id={`${id}-error`} className="japp-error type-caption">{message(issue.code)}</p>
        ) : null}
      </div>
    );
  };

  /** A labelled select. `options` are [value, label] pairs. */
  const select = (
    name: keyof TradeDraft & string,
    options: readonly (readonly [string, string])[],
    allowEmpty = false,
  ) => {
    const issue = errorFor(name);
    const id = `${fieldId}-${name}`;
    return (
      <div className="japp-field" data-invalid={issue !== undefined}>
        <label htmlFor={id}>
          <span className="type-label">{copy.fields[name as keyof typeof copy.fields]}</span>
          <span className="japp-req type-caption">
            {required(name) ? copy.required : copy.optional}
          </span>
        </label>
        <select
          id={id}
          name={name}
          value={draft[name] as string}
          onChange={(event) => set(name, event.target.value as TradeDraft[typeof name])}
          aria-invalid={issue !== undefined}
          aria-describedby={issue !== undefined ? `${id}-error` : undefined}
        >
          {allowEmpty ? <option value="">{copy.none}</option> : null}
          {options.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {issue !== undefined ? (
          <p id={`${id}-error`} className="japp-error type-caption">{message(issue.code)}</p>
        ) : null}
      </div>
    );
  };

  const conceptsLabelId = `${fieldId}-conceptIds-label`;
  const conceptIssue = errorFor("conceptIds");

  return (
    <form className="jform" onSubmit={submit} noValidate>
      <header>
        <h2 className="type-h3">{mode === "create" ? copy.newTitle : copy.editTitle}</h2>
        <p className="type-lead max-w-[var(--container-text)]">{copy.lead}</p>
      </header>

      {/* The summary is focusable and announced. Listing every problem at once
          is the difference between fixing a form and discovering it one error
          at a time. */}
      {issues.length > 0 ? (
        <div
          className="jform-errors"
          role="alert"
          tabIndex={-1}
          ref={summaryRef}
          aria-labelledby={`${fieldId}-errtitle`}
        >
          <h3 id={`${fieldId}-errtitle`} className="type-label">{copy.errorTitle}</h3>
          <p className="type-caption">{copy.errorIntro}</p>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.field}-${index}`}>
                <a href={`#${fieldId}-${issue.field}`}>
                  {copy.fields[issue.field as keyof typeof copy.fields] ?? issue.field}
                </a>
                {": "}
                {message(issue.code)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="jform-section">
        <legend className="type-label text-accent">{copy.sections.context}</legend>
        <p className="type-caption text-muted">{copy.sectionNotes.context}</p>
        <div className="jform-grid">
          {select("status", tradeStatuses.map((s) => [s, app.statuses[s]] as const))}
          {field("openedAt", "datetime-local", copy.hints.openedAt)}
          {select("instrument", tradeInstruments.map((i) => [i, lab.instruments[i]] as const))}
          {select("session", tradeSessions.map((s) => [s, lab.sessions[s]] as const), true)}
          {select("timeframe", tradeTimeframes.map((t) => [t, lab.timeframes[t]] as const), true)}
        </div>
      </fieldset>

      <fieldset className="jform-section">
        <legend className="type-label text-accent">{copy.sections.setup}</legend>
        <p className="type-caption text-muted">{copy.sectionNotes.setup}</p>
        <div className="jform-grid">
          {/* Canonical slugs. The Setup Lab stays the source of truth — the
              trade references it and never copies the specification (§13). */}
          {select(
            "setupId",
            setups.map(
              (setup) =>
                [setup.slug, lab.items[setup.slug as keyof typeof lab.items].title] as const,
            ),
            true,
          )}
        </div>
        <div className="japp-field" data-invalid={conceptIssue !== undefined}>
          <span id={conceptsLabelId} className="type-label">{copy.fields.conceptIds}</span>
          <ConceptPicker
            value={draft.conceptIds}
            onChange={(next) => set("conceptIds", next)}
            concepts={concepts}
            copy={app.picker}
            labelledBy={conceptsLabelId}
          />
          {conceptIssue !== undefined ? (
            <p className="japp-error type-caption">{message(conceptIssue.code)}</p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="jform-section">
        <legend className="type-label text-accent">{copy.sections.execution}</legend>
        <p className="type-caption text-muted">{copy.sectionNotes.execution}</p>
        <div className="jform-grid">
          {select("direction", tradeDirections.map((d) => [d, app.directions[d]] as const))}
          {field("entry", "text")}
          {field("stop", "text", copy.hints.stop)}
          {field("target", "text", copy.hints.target)}
        </div>
      </fieldset>

      <fieldset className="jform-section">
        <legend className="type-label text-accent">{copy.sections.risk}</legend>
        <p className="type-caption text-muted">{copy.sectionNotes.risk}</p>
        <div className="jform-grid">
          {field("riskAmount", "text", copy.hints.riskAmount)}
        </div>

        {/* The §7 argument made visible: a value the user could have been asked
            for, calculated instead, and honest about when it cannot be. */}
        <div className="jform-derived">
          <h3 className="type-label">{copy.derivedTitle}</h3>
          <p className="type-caption text-muted">{copy.derivedNote}</p>
          <p className="jform-derived-value">
            <span className="type-label">{copy.plannedR}</span>
            <span className="type-data" dir="ltr">{formatR(previewR)}</span>
          </p>
          {previewR === null ? (
            <p className="type-caption text-muted">{copy.plannedRNote}</p>
          ) : null}
        </div>
      </fieldset>

      {/* Only once the trade has actually closed. Showing an exit field on a
          planned trade would invite a number that the model then rejects. */}
      {draft.status === "closed" ? (
        <fieldset className="jform-section">
          <legend className="type-label text-accent">{copy.sections.outcome}</legend>
          <p className="type-caption text-muted">{copy.sectionNotes.outcome}</p>
          <div className="jform-grid">
            {field("exit", "text", copy.hints.exit)}
            {field("closedAt", "datetime-local")}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="jform-section">
        <legend className="type-label text-accent">{copy.sections.notes}</legend>
        <p className="type-caption text-muted">{copy.sectionNotes.notes}</p>
        <div className="japp-field">
          <label htmlFor={`${fieldId}-notes`}>
            <span className="type-label">{copy.fields.notes}</span>
            <span className="japp-req type-caption">{copy.optional}</span>
          </label>
          <textarea
            id={`${fieldId}-notes`}
            rows={4}
            value={draft.notes}
            onChange={(event) => set("notes", event.target.value)}
          />
        </div>
      </fieldset>

      {/* Sticky on a phone so the keyboard can never bury the save action. */}
      <div className="jform-actions">
        <button type="submit" className="btn btn-primary">
          {mode === "create" ? copy.save : copy.saveChanges}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {copy.cancel}
        </button>
      </div>
    </form>
  );
}
