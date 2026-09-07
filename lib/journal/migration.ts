import { validateTrade, type StoredTrade } from "./trade";

/**
 * STORAGE MIGRATION — master prompt §29, §45.
 *
 * EPIC 08 wrote a bare JSON array. EPIC 09 writes an envelope carrying a
 * version, because the moment a second shape exists without one, every future
 * read has to guess — and guessing is how stored data gets reinterpreted.
 *
 * TWO RULES, both from §29.
 *
 * **Nothing is discarded wholesale.** A single unreadable row does not cost
 * the user the other forty. Rows are validated individually and the bad ones
 * dropped, which is safe precisely because `validateTrade` is a pure function
 * that can be pointed at untrusted input.
 *
 * **Nothing is reinterpreted.** Migration reshapes the envelope and never a
 * field's meaning. The one default in the system — a review without
 * `complete` counts as complete — is applied at *read* time by `reviewState`,
 * not by rewriting stored records, so an EPIC 08 review still says exactly
 * what it said when it was written.
 */

/** Bumped only when the stored shape changes in a way a reader must know about. */
export const STORAGE_VERSION = 2;

export interface StorageEnvelope {
  version: number;
  trades: readonly StoredTrade[];
}

export interface MigrationResult {
  trades: readonly StoredTrade[];
  /** The version found on disk. 1 is the unversioned EPIC 08 array. */
  from: number;
  /** Rows dropped as unreadable. Surfaced in Settings rather than swallowed. */
  dropped: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Keep the rows that are actually usable.
 *
 * A row must be an object with a string id that passes full domain validation.
 * `origin` is defaulted to `user` when missing rather than to `demo`: if the
 * provenance of a record is genuinely unknown, treating it as the user's own
 * is the choice that cannot cause data loss — a demo reset deletes demo rows.
 */
function readTrades(rows: unknown): { trades: readonly StoredTrade[]; dropped: number } {
  if (!Array.isArray(rows)) return { trades: [], dropped: 0 };

  const trades: StoredTrade[] = [];
  let dropped = 0;

  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== "string") {
      dropped += 1;
      continue;
    }
    const candidate = {
      ...row,
      origin: row.origin === "demo" ? "demo" : "user",
    } as StoredTrade;

    if (validateTrade(candidate).length > 0) {
      dropped += 1;
      continue;
    }
    trades.push(candidate);
  }

  return { trades, dropped };
}

/**
 * Read whatever is in storage and return current-shape records.
 *
 * Deterministic and total: every input produces a result, and the same input
 * always produces the same one. There is no throw path, because this runs
 * during the first render of the application and a corrupt value in
 * `localStorage` must not be able to show the user a blank screen.
 */
export function migrate(raw: unknown): MigrationResult {
  // v1 — EPIC 08 wrote the array itself, with no envelope.
  if (Array.isArray(raw)) {
    const { trades, dropped } = readTrades(raw);
    return { trades, from: 1, dropped };
  }

  if (isRecord(raw) && typeof raw.version === "number") {
    const { trades, dropped } = readTrades(raw.trades);
    return { trades, from: raw.version, dropped };
  }

  // Anything else — null, a string, an object from an unrelated key — is not
  // journal data. Reporting version 0 distinguishes "nothing stored" from a
  // real version, which matters when deciding whether to seed demo records.
  return { trades: [], from: 0, dropped: 0 };
}

/** Parse a raw storage string. Invalid JSON is "nothing stored", not a crash. */
export function migrateJson(text: string | null): MigrationResult {
  if (text === null) return { trades: [], from: 0, dropped: 0 };
  try {
    return migrate(JSON.parse(text));
  } catch {
    return { trades: [], from: 0, dropped: 0 };
  }
}

export function serializeStorage(trades: readonly StoredTrade[]): string {
  const envelope: StorageEnvelope = { version: STORAGE_VERSION, trades };
  return JSON.stringify(envelope);
}
