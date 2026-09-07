import { localeDirection, type Locale } from "./i18n/config";
import type { Dictionary } from "./i18n/dictionary-type";

/**
 * THE INFORMATION ARCHITECTURE — master prompt §15, §65.
 *
 * One tree, declared as data. The same tree drives the desktop nav, the mega
 * menus, the mobile drawer, the footer, the command palette and route
 * validation. A second hand-maintained copy is how a nav and a router drift
 * apart, so there is exactly one.
 *
 * Labels are dictionary KEYS, never strings. A label that appears in this file
 * is a label that cannot be translated, and a nav that hardcodes English is a
 * nav that has to be rebuilt for the third locale.
 *
 * Routes are SEGMENTS, never full paths. The locale prefix is applied by
 * `hrefFor`, so no component concatenates a URL and no route string is
 * scattered through the tree.
 */

/** Keys into `Dictionary["nav"]` — the six top-level destinations. */
export type NavKey = Extract<
  keyof Dictionary["nav"],
  "learn" | "systems" | "setups" | "journal" | "dictionary" | "about"
>;

/** Keys into `Dictionary["nav"]["groups"]` — mega-menu children. */
export type NavGroupKey = keyof Dictionary["nav"]["groups"];

/**
 * `active`      the route exists and renders real content
 * `placeholder` the route resolves to the honest "in development" page
 * `planned`     no route yet; shown in the IA, never linked
 *
 * Three states rather than a boolean because they behave differently: a
 * placeholder is navigable and a planned destination must not be, or the nav
 * sends people to a 404.
 */
export type NavStatus = "active" | "placeholder" | "planned";

export interface NavChild {
  id: string;
  labelKey: NavGroupKey;
  /** Segment appended under the parent. Omitted while `planned`. */
  segment?: string;
  status: NavStatus;
}

export interface NavNode {
  id: string;
  labelKey: NavKey;
  segment: string;
  status: NavStatus;
  /** Present when the destination warrants a mega menu. */
  children?: readonly NavChild[];
}

/**
 * Analytics identifiers are derived from `id`, never hand-written, so an event
 * name cannot drift from the item it describes (§21).
 */
export const primaryNav: readonly NavNode[] = [
  {
    id: "learn",
    labelKey: "learn",
    segment: "academy",
    status: "active",
    children: [
      { id: "learn.academy", labelKey: "academy", status: "planned" },
      { id: "learn.foundations", labelKey: "foundations", status: "planned" },
      { id: "learn.structure", labelKey: "marketStructure", status: "planned" },
      { id: "learn.liquidity", labelKey: "liquidity", status: "planned" },
      { id: "learn.priceAction", labelKey: "priceAction", status: "planned" },
      { id: "learn.execution", labelKey: "execution", status: "planned" },
      { id: "learn.risk", labelKey: "risk", status: "planned" },
      { id: "learn.psychology", labelKey: "psychology", status: "planned" },
    ],
  },
  {
    id: "systems",
    labelKey: "systems",
    segment: "systems",
    status: "active",
    children: [
      { id: "systems.overview", labelKey: "tradingSystem", status: "planned" },
      { id: "systems.context", labelKey: "marketContext", status: "planned" },
      { id: "systems.liquidity", labelKey: "liquidity", status: "planned" },
      { id: "systems.structure", labelKey: "structure", status: "planned" },
      { id: "systems.execution", labelKey: "execution", status: "planned" },
      { id: "systems.risk", labelKey: "risk", status: "planned" },
      { id: "systems.review", labelKey: "review", status: "planned" },
    ],
  },
  {
    id: "setups",
    labelKey: "setups",
    segment: "setups",
    status: "active",
    children: [
      { id: "setups.lab", labelKey: "setupLab", status: "planned" },
      { id: "setups.all", labelKey: "allSetups", status: "planned" },
      { id: "setups.categories", labelKey: "categories", status: "planned" },
      { id: "setups.replay", labelKey: "replay", status: "planned" },
      { id: "setups.research", labelKey: "research", status: "planned" },
    ],
  },
  {
    id: "journal",
    labelKey: "journal",
    segment: "journal",
    status: "active",
    children: [
      { id: "journal.product", labelKey: "journalProduct", status: "planned" },
      { id: "journal.how", labelKey: "howItWorks", status: "planned" },
      { id: "journal.features", labelKey: "features", status: "planned" },
      { id: "journal.analytics", labelKey: "analytics", status: "planned" },
      { id: "journal.pricing", labelKey: "pricing", status: "planned" },
    ],
  },
  {
    id: "dictionary",
    labelKey: "dictionary",
    segment: "dictionary",
    status: "active",
    children: [
      { id: "dictionary.index", labelKey: "tradingDictionary", status: "planned" },
      { id: "dictionary.browse", labelKey: "browseTerms", status: "planned" },
      { id: "dictionary.categories", labelKey: "categories", status: "planned" },
    ],
  },
  { id: "about", labelKey: "about", segment: "about", status: "placeholder" },
];

/** Segments with a real route. Drives `generateStaticParams` and validation. */
export const navSegments: readonly string[] = primaryNav
  .filter((item) => item.status !== "planned")
  .map((item) => item.segment);

export function findNavItem(segment: string): NavNode | undefined {
  return primaryNav.find((item) => item.segment === segment);
}

/**
 * The single place a navigation URL is built. Returns null for anything not
 * navigable, so a caller cannot accidentally render a link to a route that
 * does not exist — the type system forces the null branch.
 */
export function hrefFor(
  locale: Locale,
  node: NavNode | NavChild,
  parent?: NavNode,
): string | null {
  if (node.status === "planned") return null;
  if (node.segment === undefined) return null;
  return parent === undefined
    ? `/${locale}/${node.segment}`
    : `/${locale}/${parent.segment}/${node.segment}`;
}

export const ctaHref = (locale: Locale): string => `/${locale}/academy`;

/**
 * ACTIVE ROUTE DETECTION — §7.
 *
 * Segment-aware rather than string-prefix based. `startsWith` would mark
 * `/en/setups` active for `/en/setups-archive`, and comparing raw pathnames
 * breaks the moment a nested route appears. Splitting into segments and
 * comparing the one after the locale is correct for `/fa/setups`,
 * `/fa/setups/unicorn` and any future depth, in both locales, and it will keep
 * working for authenticated routes under the same shape.
 */
export function routeSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

export function isNavItemActive(pathname: string, node: NavNode): boolean {
  const segments = routeSegments(pathname);
  // [0] is the locale; [1] is the section.
  return segments[1] === node.segment;
}

export function isNavChildActive(
  pathname: string,
  parent: NavNode,
  child: NavChild,
): boolean {
  if (child.segment === undefined) return false;
  const segments = routeSegments(pathname);
  return segments[1] === parent.segment && segments[2] === child.segment;
}

/** Which top-level item, if any, the current route belongs to. */
export function activeNavId(pathname: string): string | null {
  return primaryNav.find((item) => isNavItemActive(pathname, item))?.id ?? null;
}

/**
 * Direction-aware arrow-key mapping. In RTL, ArrowRight moves toward the
 * START of the list, not the end — hardcoding right-means-next is the classic
 * way a keyboard menu becomes unusable in Persian (§16).
 */
export function horizontalStep(key: string, locale: Locale): -1 | 0 | 1 {
  const rtl = localeDirection[locale] === "rtl";
  if (key === "ArrowRight") return rtl ? -1 : 1;
  if (key === "ArrowLeft") return rtl ? 1 : -1;
  return 0;
}
