/**
 * FRAGMENT ADDRESSING FOR PRIVATE RECORDS — master prompt §34.
 *
 * A private record is addressed by URL fragment, never by a path segment.
 *
 * The reason is not stylistic. A fragment is the one part of a URL that is
 * **never sent to a server**: it does not appear in a request line, an access
 * log, a referrer header or a CDN cache key. Combined with a statically
 * exported shell that prerenders no records, that makes the privacy boundary
 * structural — there is no code path along which a trade id could reach
 * infrastructure, so none has to be remembered not to.
 *
 * It is also the only option compatible with `dynamicParams = false`. A route
 * like `/app/trades/[id]/edit` would need every id at build time, which for
 * user data is impossible and for demo data would publish the ids in the route
 * manifest. §34 forbids both.
 *
 * These are pure string functions with no `window` access so they can be
 * tested directly, which is the point — fragment parsing is exactly the kind
 * of code that rots silently in a `useEffect`.
 */

/** What the user is doing with the addressed trade. */
export const tradeModes = ["view", "edit", "review"] as const;
export type TradeMode = (typeof tradeModes)[number];

export interface FragmentState {
  /** The addressed trade, or null when no trade is open. */
  tradeId: string | null;
  mode: TradeMode;
  /**
   * A write just succeeded and the confirmation has not been shown yet.
   *
   * This is here rather than in component state for a concrete reason.
   * Creating a trade navigates from `/app/trades/new` to `/app/trades`, and
   * that param change **remounts** the shell — verified in the browser, not
   * assumed — so any `useState` holding "saved" is destroyed before it can
   * render. The fragment is the one channel that already carries transient
   * view state across that boundary, and it is never sent to a server.
   *
   * It is stripped from the URL as soon as it is announced, so a reload does
   * not repeat a confirmation for something that happened minutes ago.
   */
  saved: boolean;
}

export const emptyFragment: FragmentState = { tradeId: null, mode: "view", saved: false };

function isTradeMode(value: string): value is TradeMode {
  return (tradeModes as readonly string[]).includes(value);
}

/**
 * Parse `#trade=demo-01&mode=edit`.
 *
 * Tolerant by design: a fragment can be typed by hand, truncated by a chat
 * client or carried over from an older build. Anything unrecognised degrades
 * to "no trade open" rather than throwing, because a malformed URL must not
 * be able to break the application.
 *
 * An unknown mode falls back to `view` rather than being rejected: showing the
 * record read-only is the safe interpretation, and it cannot destroy data.
 */
export function parseFragment(hash: string): FragmentState {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw === "") return emptyFragment;

  const params = new URLSearchParams(raw);
  const id = params.get("trade");
  if (id === null || id.trim() === "") return emptyFragment;

  const mode = params.get("mode");
  return {
    tradeId: id,
    mode: mode !== null && isTradeMode(mode) ? mode : "view",
    saved: params.get("saved") === "1",
  };
}

/** Serialize back to a fragment, `""` when nothing is open. */
export function serializeFragment(state: FragmentState): string {
  if (state.tradeId === null) return "";
  const parts = [`trade=${encodeURIComponent(state.tradeId)}`];
  // `mode=view` is omitted because it is the default — a shorter URL is a URL
  // a person can read, and the round-trip is still exact.
  if (state.mode !== "view") parts.push(`mode=${state.mode}`);
  if (state.saved) parts.push("saved=1");
  return `#${parts.join("&")}`;
}
