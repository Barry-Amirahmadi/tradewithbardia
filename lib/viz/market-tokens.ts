/**
 * THE TRADING VISUALIZATION VOCABULARY — master prompt §19, §21.
 *
 * One list of roles, shared by every renderer. It lives apart from the
 * renderers because both of them were spelling the same custom properties out
 * by hand: the canvas in a lookup map, the SVG in string literals scattered
 * through its annotation switch. Two copies of a vocabulary is how a chart
 * ends up drawing "liquidity" in a colour that means something else somewhere
 * else in the product — and the whole point of §19 is that a visitor who
 * learns the language in the hero recognises it in the Setup Lab, the Journal
 * and the dashboard later.
 *
 * The values are token names, never colours. A renderer resolves them against
 * the live theme; nothing here knows whether it is light or dark.
 */
export const marketTokens = {
  bullish: "--market-bullish",
  bearish: "--market-bearish",
  grid: "--market-grid",
  axis: "--market-axis",
  neutral: "--market-neutral",
  liquidity: "--market-liquidity",
  sweep: "--market-sweep",
  structure: "--market-structure",
  imbalance: "--market-imbalance",
  annotation: "--market-annotation",
  entry: "--market-entry",
  stop: "--market-stop",
  target: "--market-target",
} as const;

export type MarketRole = keyof typeof marketTokens;

/** For renderers that hand colours to CSS rather than resolving them itself. */
export function marketVar(role: MarketRole): string {
  return `var(${marketTokens[role]})`;
}
