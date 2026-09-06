"use client";

import { useSyncExternalStore } from "react";

import { track } from "@/lib/analytics";
import {
  progressSnapshot,
  resetProgress,
  serverProgressSnapshot,
  subscribeProgress,
  toggleLessonRead,
} from "@/lib/academy/progress";
import type { Dictionary } from "@/lib/i18n/dictionary-type";

/**
 * PROGRESS UI — master prompt §20, §21.
 *
 * Two small clients over the same local store. Everything else in the Academy
 * is a server component; this is the only part that needs the browser, because
 * the state lives in `localStorage` and nowhere else.
 *
 * The wording is deliberate. It says "read", never "completed" or "mastered",
 * and the summary carries an explicit note that nothing is saved to an
 * account. There is no certificate, no badge and no score, because there is no
 * assessment behind them (§21).
 */

function useRead(): readonly string[] {
  return useSyncExternalStore(
    subscribeProgress,
    progressSnapshot,
    serverProgressSnapshot,
  );
}

export function LessonReadToggle({
  lessonId,
  academy,
}: {
  lessonId: string;
  academy: Dictionary["academy"];
}) {
  const read = useRead();
  const done = read.includes(lessonId);

  return (
    <button
      type="button"
      className={done ? "btn btn-ghost" : "btn btn-primary"}
      aria-pressed={done}
      onClick={() => {
        toggleLessonRead(lessonId);
        if (!done) track("academy_lesson_complete", { id: `lesson.${lessonId}`, surface: "academy" });
      }}
    >
      {done ? `✓ ${academy.markedComplete}` : academy.markComplete}
    </button>
  );
}

export function ProgressSummary({
  total,
  academy,
}: {
  total: number;
  academy: Dictionary["academy"];
}) {
  const read = useRead();

  return (
    <div className="academy-progress">
      <p className="type-label">{academy.progressLabel}</p>
      <p className="academy-progress-count type-data">
        {academy.completedCount
          .replace("{done}", String(read.length))
          .replace("{total}", String(total))}
      </p>
      {/* The honesty line is not fine print — it is the reason the feature is
          allowed to exist without an account. */}
      <p className="type-caption text-muted">{academy.progressNote}</p>
      {read.length > 0 ? (
        <button type="button" className="academy-reset" onClick={resetProgress}>
          {academy.progressReset}
        </button>
      ) : null}
    </div>
  );
}

/** A read marker on a curriculum row. Purely a reflection of local state. */
export function LessonReadDot({ lessonId, label }: { lessonId: string; label: string }) {
  const read = useRead();
  if (!read.includes(lessonId)) return null;
  return (
    <span className="academy-read-dot" title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">✓</span>
    </span>
  );
}
