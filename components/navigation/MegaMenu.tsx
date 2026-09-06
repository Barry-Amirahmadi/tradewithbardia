"use client";

import Link from "next/link";
import { useEffect, useId } from "react";

import { track } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { hrefFor, isNavChildActive, type NavNode } from "@/lib/navigation";

/**
 * MEGA MENU — master prompt §5, §16, §17.
 *
 * A disclosure, not an ARIA `menu`. The APG reserves `role="menu"` for
 * application-style command menus with roving focus; this is a list of
 * navigation links, and announcing it as a menu makes a screen reader promise
 * keyboard behaviour that links do not have. A button with `aria-expanded`
 * over a plain `<ul>` of links is the correct pattern and the one that
 * actually works with Tab.
 *
 * The panel is rendered only while open. Keeping six panels in the DOM would
 * put every planned destination in the tab order of every page.
 */

interface Props {
  node: NavNode;
  locale: Locale;
  nav: Dictionary["nav"];
  pathname: string;
  open: boolean;
  onRequestClose: () => void;
  /** Id shared with the trigger's `aria-controls`. */
  panelId: string;
}

export default function MegaMenu({
  node,
  locale,
  nav,
  pathname,
  open,
  onRequestClose,
  panelId,
}: Props) {
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    track("mega_menu_open", {
      id: `nav.${node.id}`,
      surface: "desktop-nav",
      count: node.children?.length ?? 0,
    });
  }, [open, node]);

  // Escape closes. Focus restoration is the trigger's job, not the panel's —
  // the panel unmounts on close, so it cannot be the thing that decides where
  // focus lands. `closeMega` in Navbar returns focus to the trigger, and only
  // when focus was actually inside the item.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onRequestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onRequestClose]);

  if (!open || node.children === undefined) return null;

  const sectionHref = hrefFor(locale, node);

  return (
    <div
      id={panelId}
      className="mega-panel"
      aria-labelledby={headingId}
    >
      {/* The section's own destination leads the panel. Making the trigger a
          button means this is the only way to reach the section itself. */}
      {sectionHref !== null ? (
        <Link
          href={sectionHref}
          id={headingId}
          className="mega-heading"
          onClick={() =>
            track("nav_click", { id: `nav.${node.id}`, surface: "mega-menu" })
          }
        >
          {nav[node.labelKey]}
        </Link>
      ) : (
        <span id={headingId} className="mega-heading">
          {nav[node.labelKey]}
        </span>
      )}

      <ul className="mega-list">
        {node.children.map((child) => {
          const href = hrefFor(locale, child, node);
          const active = isNavChildActive(pathname, node, child);
          const label = nav.groups[child.labelKey];

          // Planned destinations are shown but never linked — the IA is real
          // even where the page is not, and a link to a 404 is worse than an
          // honest label (§5).
          if (href === null) {
            return (
              <li key={child.id}>
                <span
                  className="mega-item mega-item-planned"
                  aria-disabled="true"
                >
                  {label}
                  <span className="mega-badge type-label">{nav.comingSoon}</span>
                </span>
              </li>
            );
          }

          return (
            <li key={child.id}>
              <Link
                href={href}
                className="mega-item"
                aria-current={active ? "page" : undefined}
                onClick={() =>
                  track("nav_click", { id: `nav.${child.id}`, surface: "mega-menu" })
                }
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
