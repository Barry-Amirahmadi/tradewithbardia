/**
 * ANALYTICS INTERFACE — master prompt §21, §64.
 *
 * One `track` call, one event vocabulary. No provider is integrated and none
 * should be until there is a decision about which; what exists here is the
 * seam, so that adding one later is a single implementation rather than a
 * sweep through every component adding calls.
 *
 * Nothing here fabricates analytics. With no sink registered, `track` is a
 * no-op in production and a console line in development — deliberately not a
 * queue that silently grows, and never a network request.
 */

/** Stable event names. Adding one here is the only way to add an event. */
export type AnalyticsEvent =
  | "nav_click"
  | "nav_open"
  | "nav_close"
  | "mega_menu_open"
  | "mega_menu_close"
  | "search_open"
  | "search_close"
  | "search_query"
  | "search_select"
  | "language_change"
  | "theme_change"
  | "cta_click"
  // Trading System Story (EPIC 04). Payload ids are canonical concept and
  // stage ids — `system.liquidity`, `concept.mss` — never display strings,
  // which differ by locale and would split one event into two.
  | "system_view"
  | "system_stage_enter"
  | "concept_open"
  // Setup Laboratory (EPIC 05). Ids are setup slugs and filter dimensions,
  // never display strings.
  | "setup_open"
  | "setup_filter"
  | "replay_play";

/**
 * Payloads carry identifiers and UI state only. No free text from a user, no
 * page content, nothing that could become personal data by accident — a
 * search *query* is deliberately reported as a length, not a string.
 */
export interface AnalyticsPayload {
  /** Stable id of the thing interacted with, e.g. `nav.setups`. */
  id?: string;
  /** Where the interaction happened, e.g. `desktop-nav`, `mobile-menu`. */
  surface?: string;
  locale?: string;
  theme?: string;
  /** Result count for a search, or item count for a menu. */
  count?: number;
  /** Length of a query — never the query itself. */
  queryLength?: number;
}

type Sink = (event: AnalyticsEvent, payload: AnalyticsPayload) => void;

let sink: Sink | null = null;

/** Registered once, by a future provider integration. */
export function setAnalyticsSink(next: Sink | null): void {
  sink = next;
}

export function track(
  event: AnalyticsEvent,
  payload: AnalyticsPayload = {},
): void {
  if (sink !== null) {
    sink(event, payload);
    return;
  }
  if (process.env.NODE_ENV === "development") {
    // Visible while building, silent in production. Never queued.
    console.debug("[analytics]", event, payload);
  }
}
