/**
 * APP VIEW NAMES — master prompt §14.
 *
 * Deliberately its own module with no `"use client"` directive, because both
 * sides need it: the route resolves a URL segment on the server, and the shell
 * switches on the same value in the browser. A client module cannot export a
 * function the server calls, so the shared vocabulary lives here and the
 * boundary stays honest.
 */
export const appViews = ["dashboard", "trades", "review", "analytics"] as const;

export type AppView = (typeof appViews)[number];

export function isAppView(value: string): value is AppView {
  return (appViews as readonly string[]).includes(value);
}
