import { validateTrade, type StoredTrade, type Trade } from "./trade";

/**
 * THE TRADE REPOSITORY — master prompt §15, §16, §31, §39, §45.
 *
 * Storage is an implementation detail behind one interface, so that the UI
 * never imports `localStorage` and never learns where records live. Replacing
 * the local adapter with a server-backed one later is a new class and a
 * different construction call — not a sweep through every component.
 *
 * Every method is async even where the implementation is synchronous. A local
 * adapter that resolves immediately and a network adapter that does not must
 * be the same shape to the caller, or the swap is a rewrite after all.
 *
 * PRIVACY (§24). Nothing here runs on the server, nothing is fetched, and
 * nothing is serialized into a route payload. Trades exist in one browser
 * until a real backend and real authentication exist — and this file is the
 * only place that would change.
 */

export interface TradeRepository {
  list(): Promise<readonly StoredTrade[]>;
  get(id: string): Promise<StoredTrade | undefined>;
  create(trade: StoredTrade): Promise<StoredTrade>;
  update(id: string, patch: Partial<Trade>): Promise<StoredTrade | undefined>;
  remove(id: string): Promise<boolean>;
  /** Notified on every write, so a view can re-read without polling. */
  subscribe(onChange: () => void): () => void;
}

/**
 * Thrown on a write that would store an invalid record.
 *
 * The field is declared and assigned explicitly rather than as a constructor
 * parameter property: `npm test` runs Node's type-stripping loader, which
 * supports only syntax that erases to nothing, and a parameter property emits
 * an assignment. Keeping to that subset is what lets this project test
 * TypeScript with zero test dependencies.
 */
export class InvalidTradeError extends Error {
  readonly issues: readonly { field: string; reason: string }[];

  constructor(issues: readonly { field: string; reason: string }[]) {
    super(`invalid trade: ${issues.map((i) => `${i.field} ${i.reason}`).join(", ")}`);
    this.name = "InvalidTradeError";
    this.issues = issues;
  }
}

function assertValid(trade: Trade): void {
  const issues = validateTrade(trade);
  if (issues.length > 0) throw new InvalidTradeError(issues);
}

/**
 * In memory. The reference implementation, and what tests run against.
 *
 * Seeded records are copied on the way in and out, so a caller mutating a
 * returned object cannot corrupt the store — the mistake a plain array would
 * make easy and silent.
 */
export class MemoryTradeRepository implements TradeRepository {
  private trades: StoredTrade[];
  private readonly listeners = new Set<() => void>();

  constructor(seed: readonly StoredTrade[] = []) {
    this.trades = seed.map((trade) => ({ ...trade }));
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  async list(): Promise<readonly StoredTrade[]> {
    return this.trades.map((trade) => ({ ...trade }));
  }

  async get(id: string): Promise<StoredTrade | undefined> {
    const found = this.trades.find((trade) => trade.id === id);
    return found === undefined ? undefined : { ...found };
  }

  async create(trade: StoredTrade): Promise<StoredTrade> {
    assertValid(trade);
    if (this.trades.some((existing) => existing.id === trade.id)) {
      throw new InvalidTradeError([{ field: "id", reason: "already exists" }]);
    }
    this.trades = [...this.trades, { ...trade }];
    this.notify();
    return { ...trade };
  }

  async update(id: string, patch: Partial<Trade>): Promise<StoredTrade | undefined> {
    const index = this.trades.findIndex((trade) => trade.id === id);
    if (index < 0) return undefined;
    const current = this.trades[index];
    if (current === undefined) return undefined;
    // `id` and `origin` are not patchable: a demo record must never be able to
    // become a user record, and an id is an identity, not a field.
    const next: StoredTrade = { ...current, ...patch, id: current.id, origin: current.origin };
    assertValid(next);
    this.trades = this.trades.map((trade, i) => (i === index ? next : trade));
    this.notify();
    return { ...next };
  }

  async remove(id: string): Promise<boolean> {
    const before = this.trades.length;
    this.trades = this.trades.filter((trade) => trade.id !== id);
    const removed = this.trades.length < before;
    if (removed) this.notify();
    return removed;
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }
}

const STORAGE_KEY = "twb.journal.trades";

/**
 * Browser-local. Wraps the memory implementation and persists after each write.
 *
 * Reads are defensive because `localStorage` is hostile: it throws in private
 * mode on some browsers, can be disabled, and can hold anything a previous
 * version or another tab wrote. A malformed record is dropped rather than
 * crashing the app — and dropping it is safe precisely because validation is
 * a pure function that can be applied to untrusted input.
 */
export class LocalTradeRepository implements TradeRepository {
  private readonly inner: MemoryTradeRepository;

  constructor(seed: readonly StoredTrade[] = []) {
    this.inner = new MemoryTradeRepository(LocalTradeRepository.read(seed));
    this.inner.subscribe(() => void this.persist());
  }

  private static read(seed: readonly StoredTrade[]): readonly StoredTrade[] {
    if (typeof window === "undefined") return seed;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return seed;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return seed;
      return parsed.filter(
        (row): row is StoredTrade =>
          typeof row === "object" &&
          row !== null &&
          typeof (row as StoredTrade).id === "string" &&
          validateTrade(row as StoredTrade).length === 0,
      );
    } catch {
      return seed;
    }
  }

  private async persist(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const all = await this.inner.list();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Storage full or blocked. The in-memory store still drives the session,
      // which beats throwing inside a click handler.
    }
  }

  list() { return this.inner.list(); }
  get(id: string) { return this.inner.get(id); }
  create(trade: StoredTrade) { return this.inner.create(trade); }
  update(id: string, patch: Partial<Trade>) { return this.inner.update(id, patch); }
  remove(id: string) { return this.inner.remove(id); }
  subscribe(onChange: () => void) { return this.inner.subscribe(onChange); }
}
