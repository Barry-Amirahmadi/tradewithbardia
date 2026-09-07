"use client";

import { useState } from "react";

import ConfirmDialog from "./ConfirmDialog";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { storageMode } from "@/lib/journal/analytics";
import { formatCount } from "@/lib/journal/format";
import type { Locale } from "@/lib/i18n/config";
import type { MigrationResult } from "@/lib/journal/migration";
import type { StoredTrade } from "@/lib/journal/trade";

/**
 * SETTINGS — master prompt §27, §28, §31, §32, §36, §50.
 *
 * The fifth navigation item §36 names, and the right home for three things
 * that were previously either homeless or in the wrong place.
 *
 * **Where the data is.** §27 forbids any ambiguity between demo and user
 * records, and the mode shown here is derived from the records themselves
 * rather than a stored flag — so it cannot drift from what is on screen.
 *
 * **What this version does not do.** §31 and §32 both end with "document
 * limitations". Documenting them in `docs/` tells developers; a user of the
 * journal deserves to know that times are UTC, that amounts are dollars, and
 * that the only copy of their records lives in one browser. Stating that
 * plainly is the same commitment PROJECT_RULES §1 makes about performance
 * figures: say what is true, including when it is inconvenient.
 *
 * **The destructive actions.** Reset used to sit in the application header,
 * one stray click from wiping a session. Both actions here go through a
 * confirmation that names the consequence (§26).
 */

type PendingAction = "reset" | "deleteAll" | null;

export default function SettingsView({
  locale,
  trades,
  journal,
  migration,
  onReset,
  onDeleteAll,
}: {
  locale: Locale;
  trades: readonly StoredTrade[];
  journal: Dictionary["journal"];
  migration: MigrationResult | null;
  onReset: () => Promise<void>;
  onDeleteAll: () => Promise<void>;
}) {
  const app = journal.app;
  const copy = app.settings;
  const [pending, setPending] = useState<PendingAction>(null);

  const mode = storageMode(trades);

  const confirm = () => {
    const action = pending;
    setPending(null);
    if (action === "reset") void onReset();
    if (action === "deleteAll") void onDeleteAll();
  };

  /**
   * Export as a JSON download.
   *
   * A blob URL and an anchor — no dependency, no upload, nothing leaves the
   * machine. Included because the storage limitation below is real: clearing
   * browser data destroys the only copy of a user's records, and a journal
   * that can lose its evidence silently fails at the one thing it is for.
   */
  const exportRecords = () => {
    const blob = new Blob([JSON.stringify(trades, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `journal-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="japp-view">
      <h2 className="type-h3">{copy.title}</h2>
      <p className="type-lead max-w-[var(--container-text)]">{copy.lead}</p>

      <section className="jsettings-block">
        <h3 className="type-label text-accent">{copy.storageTitle}</h3>
        <p className="jsettings-mode">
          <span className="japp-banner-tag type-label">{app.storage[mode]}</span>
          <span className="type-caption">{app.storageNote[mode]}</span>
        </p>
        <p className="text-secondary max-w-[var(--container-text)]">{copy.storageBody}</p>
        <dl className="japp-dl">
          <div>
            <dt>{copy.recordCount}</dt>
            <dd dir="ltr">{formatCount(trades.length, locale)}</dd>
          </div>
        </dl>

        {/* Only shown when something actually happened to the stored data —
            an unread notice about a migration that did not occur is noise. */}
        {migration !== null && migration.from > 0 && migration.from < 2 ? (
          <p className="type-caption text-muted">{copy.migrationBody}</p>
        ) : null}
        {migration !== null && migration.dropped > 0 ? (
          <p className="japp-error type-caption" role="status">
            {copy.droppedNote.replace("{count}", formatCount(migration.dropped, locale))}
          </p>
        ) : null}
      </section>

      <section className="jsettings-block">
        <h3 className="type-label text-accent">{copy.limitationsTitle}</h3>
        <ul className="jsettings-list">
          {copy.limitations.map((line) => (
            <li key={line} className="text-secondary">{line}</li>
          ))}
        </ul>
      </section>

      <section className="jsettings-block">
        <h3 className="type-label text-accent">{copy.exportTitle}</h3>
        <p className="text-secondary max-w-[var(--container-text)]">{copy.exportBody}</p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={exportRecords}
          disabled={trades.length === 0}
        >
          {copy.export}
        </button>
      </section>

      <section className="jsettings-block" data-danger="true">
        <h3 className="type-label text-accent">{copy.dangerTitle}</h3>
        <p className="text-secondary max-w-[var(--container-text)]">{copy.resetBody}</p>
        <button type="button" className="btn btn-ghost" onClick={() => setPending("reset")}>
          {copy.reset}
        </button>
        <p className="text-secondary max-w-[var(--container-text)]">{copy.deleteAllBody}</p>
        <button type="button" className="btn btn-destructive" onClick={() => setPending("deleteAll")}>
          {copy.deleteAll}
        </button>
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={pending === "reset" ? copy.resetConfirm : copy.deleteAllConfirm}
        body={pending === "reset" ? copy.resetBody : app.actions.deleteBody}
        confirmLabel={pending === "reset" ? copy.reset : copy.deleteAll}
        cancelLabel={app.actions.deleteCancel}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
