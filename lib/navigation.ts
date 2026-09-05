import type { Dictionary } from "./i18n/dictionary-type";

/**
 * The information architecture — master prompt §15, §65.
 *
 * Declared as data, in one place, because the same list drives the desktop
 * nav, the mobile menu, the footer, the sitemap and route validation. A second
 * hand-maintained copy of this list is how a nav and a router drift apart.
 *
 * `pending` marks a section whose page is still the Phase 0 placeholder. The
 * route resolves and the shell renders; only the content is outstanding. When
 * a section ships, flip one boolean.
 */
export interface NavItem {
  /** Key into `Dictionary["nav"]`, so labels stay localized. */
  key: Extract<
    keyof Dictionary["nav"],
    "learn" | "systems" | "setups" | "journal" | "dictionary" | "about"
  >;
  segment: string;
  pending: boolean;
}

export const primaryNav: readonly NavItem[] = [
  { key: "learn", segment: "learn", pending: true },
  { key: "systems", segment: "systems", pending: true },
  { key: "setups", segment: "setups", pending: true },
  { key: "journal", segment: "journal", pending: true },
  { key: "dictionary", segment: "dictionary", pending: true },
  { key: "about", segment: "about", pending: true },
];

export const navSegments: readonly string[] = primaryNav.map(
  (item) => item.segment,
);

export function findNavItem(segment: string): NavItem | undefined {
  return primaryNav.find((item) => item.segment === segment);
}
