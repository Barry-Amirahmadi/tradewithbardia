"use client";

/**
 * LOCAL LESSON PROGRESS — master prompt §20.
 *
 * Deliberately and visibly local. There is no account, no backend and no
 * network call; this is `localStorage` in one browser, and the UI says so in
 * words rather than implying a synced profile that does not exist. Pretending
 * progress is saved server-side would be the same class of dishonesty as a
 * fabricated backtest.
 *
 * Shaped as an external store so the future is cheap: when accounts exist,
 * `subscribe`/`snapshot` are backed by a server instead of by storage, and no
 * lesson component changes. The eventual `User → LessonProgress →
 * ConceptMastery` chain hangs off this same seam.
 *
 * Reads are defensive because `localStorage` is genuinely hostile: it throws
 * in private mode on some browsers, can be disabled entirely, and can contain
 * anything a previous version or another tab wrote.
 */

const KEY = "twb.academy.read";

/** Notified on local writes; `storage` covers other tabs. */
const listeners = new Set<() => void>();

/** Cached so `getSnapshot` returns a stable reference between writes. */
let cache: readonly string[] | null = null;

function read(): readonly string[] {
  if (cache !== null) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    // Anything could be in there. Accept only a list of strings.
    cache = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: readonly string[]): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked. The in-memory value still drives this session,
    // which is a better outcome than throwing inside a click handler.
  }
  for (const listener of listeners) listener();
}

export function subscribeProgress(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== KEY) return;
    cache = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function progressSnapshot(): readonly string[] {
  return read();
}

/** The server has no browser storage, and must return a stable empty value. */
const EMPTY: readonly string[] = [];
export function serverProgressSnapshot(): readonly string[] {
  return EMPTY;
}

export function toggleLessonRead(id: string): void {
  const current = read();
  write(current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
}

export function resetProgress(): void {
  write([]);
}
