/**
 * NAVIGATION STATE MACHINE — master prompt §3, §19.
 *
 * A pure reducer over scroll position. It lives here rather than inside the
 * navbar for two reasons: the transition rules are the kind of thing that
 * quietly rots (a wrong sign, a threshold that makes the bar flicker), and a
 * pure function can be tested without a browser or a scroll.
 *
 * The pipeline the master prompt asks for is:
 *
 *   scroll position → normalized scroll state → navigation state → animation
 *
 * This module is the middle two steps. The frame loop supplies the first; CSS
 * transitions driven by a `data-state` attribute supply the last, so no React
 * render happens on scroll.
 */

export type NavState = "initial" | "scrolled" | "hidden" | "menu-open";

/** Above this, the bar is still "at the top" and stays transparent. */
export const TOP_THRESHOLD = 24;
/** Below this depth, hiding on a downward scroll would feel like a glitch. */
export const HIDE_AFTER = 240;
/**
 * Sub-pixel jitter and the rubber-band at the ends of the document both
 * produce tiny deltas. Ignoring them is what stops the bar flickering.
 */
export const DELTA_THRESHOLD = 4;

export interface NavStateInput {
  /** Current scroll offset in px. */
  y: number;
  /** Change since the last sampled position. Positive means scrolling down. */
  delta: number;
  menuOpen: boolean;
  current: NavState;
}

export function nextNavState({
  y,
  delta,
  menuOpen,
  current,
}: NavStateInput): NavState {
  // An open menu owns the bar completely — it must stay put and stay visible
  // regardless of what the page is doing underneath it.
  if (menuOpen) return "menu-open";

  if (y < TOP_THRESHOLD) return "initial";

  // Hide only on a deliberate downward scroll, and only once there is enough
  // page behind us that hiding reads as reclaiming space rather than as the
  // navigation disappearing.
  if (delta > DELTA_THRESHOLD && y > HIDE_AFTER) return "hidden";

  // Any deliberate upward scroll brings it straight back. This is the half
  // that stops a hiding navbar feeling broken.
  if (delta < -DELTA_THRESHOLD) return "scrolled";

  // Leaving the top without a decisive direction: settle into the compact
  // state rather than staying transparent over content.
  if (current === "initial") return "scrolled";

  // Otherwise hold — small deltas must not change anything.
  return current === "menu-open" ? "scrolled" : current;
}

/** True when the state should paint a background and separator. */
export function isCondensed(state: NavState): boolean {
  return state !== "initial";
}
