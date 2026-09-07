/**
 * APP SCREEN NAMES — master prompt EPIC 08 §14, EPIC 09 §35, §36.
 *
 * Deliberately its own module with no `"use client"` directive, because both
 * sides need it: the route resolves a URL segment on the server, and the shell
 * switches on the same value in the browser. A client module cannot export a
 * function the server calls, so the shared vocabulary lives here and the
 * boundary stays honest.
 *
 * EPIC 09 adds two things and no more.
 *
 * `settings` is the fifth navigation item named by §36. It is where the
 * storage mode, the demo reset and the product's honest limitations live —
 * the reset button used to sit in the header, which is the wrong place for a
 * destructive action.
 *
 * `trades/new` is a **screen**, not a record. This is the distinction §34
 * turns on: a static route per *kind of screen* is fine, a static route per
 * user trade is forbidden, because generating one would require the record's
 * id at build time and put private data into the route manifest. Editing an
 * existing trade therefore happens under `/app/trades` addressed by fragment
 * (see `fragment.ts`), while creating one — which by definition has no id yet
 * — gets a real, linkable route.
 */
export const appViews = ["dashboard", "trades", "review", "analytics", "settings"] as const;

export type AppView = (typeof appViews)[number];

export function isAppView(value: string): value is AppView {
  return (appViews as readonly string[]).includes(value);
}

/**
 * `list` is the normal screen for a view; `new` is the trade capture form.
 *
 * Kept as a mode on the screen rather than a sixth view so the navigation and
 * the analytics vocabulary stay the five items §36 asks for — a capture form
 * is a thing you do to trades, not a peer of Dashboard.
 */
export type AppMode = "list" | "new";

export interface AppScreen {
  view: AppView;
  mode: AppMode;
}

/**
 * Every URL the application shell answers to, as path segments.
 *
 * This array is the single source for `generateStaticParams`, so a screen
 * cannot exist in the resolver without also being prerendered — the failure
 * mode where a link 404s in the exported build but works in dev.
 */
export const appScreenSegments: readonly (readonly string[])[] = [
  [],
  ...appViews.map((view) => [view]),
  ["trades", "new"],
];

/**
 * Resolve URL segments to a screen, or `null` for a routing miss.
 *
 * Returns null rather than falling back to the dashboard: a mistyped URL
 * should be a 404, not a silent redirect that hides a broken link.
 */
export function resolveAppScreen(segments: readonly string[]): AppScreen | null {
  const [first, second, ...rest] = segments;
  if (rest.length > 0) return null;

  // A bare `/app` is the dashboard.
  if (first === undefined) return { view: "dashboard", mode: "list" };
  if (!isAppView(first)) return null;

  if (second === undefined) return { view: first, mode: "list" };
  if (first === "trades" && second === "new") return { view: "trades", mode: "new" };
  return null;
}
