"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import LocaleToggle from "./LocaleToggle";
import ThemeToggle from "./ThemeToggle";
import { track } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { useDismissableLayer } from "@/lib/interaction/use-dismissable-layer";
import {
  ctaHref,
  hrefFor,
  isNavItemActive,
  primaryNav,
} from "@/lib/navigation";

/**
 * MOBILE NAVIGATION — master prompt §8, §16, §17, §28.
 *
 * Structurally different from the desktop bar, not a narrowed copy: sections
 * expand in place as accordions rather than opening a hover panel, the whole
 * viewport is used, and every target meets the 44px minimum.
 *
 * Viewport uses `100dvh`, so the panel tracks iOS Safari's collapsing toolbar
 * instead of being cropped by it, and safe-area insets are honoured so the
 * close control never lands under the notch or the home indicator.
 *
 * Focus trapping, scroll locking, Escape and focus restoration all come from
 * the shared dismissable-layer hook — the same one the command palette uses,
 * so the two cannot drift apart.
 */

interface Props {
  locale: Locale;
  nav: Dictionary["nav"];
  pathname: string;
  onClose: () => void;
  onOpenSearch: () => void;
}

export default function MobileMenu({
  locale,
  nav,
  pathname,
  onClose,
  onOpenSearch,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Which section is expanded. The active section opens by default so the
  // user's current location is visible without hunting for it.
  const [expanded, setExpanded] = useState<string | null>(
    () => primaryNav.find((n) => isNavItemActive(pathname, n))?.id ?? null,
  );

  useDismissableLayer({ open: true, onDismiss: onClose, containerRef });

  return (
    <div
      ref={containerRef}
      id="mobile-menu"
      className="menu-overlay lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={nav.primaryLabel}
    >
      <nav className="container-page menu-scroll" aria-label={nav.primaryLabel}>
        <button type="button" className="menu-search" onClick={onOpenSearch}>
          <span aria-hidden="true">⌕</span>
          <span>{nav.search}</span>
        </button>

        <ul className="menu-list">
          {primaryNav.map((node, index) => {
            const href = hrefFor(locale, node);
            const active = isNavItemActive(pathname, node);
            const hasChildren = node.children !== undefined;
            const isOpen = expanded === node.id;
            const panelId = `mobile-section-${node.id}`;

            return (
              <li key={node.id} style={{ ["--i" as string]: index }}>
                <div className="menu-row">
                  {href !== null ? (
                    <Link
                      href={href}
                      className={`menu-item${active ? " menu-item-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        track("nav_click", {
                          id: `nav.${node.id}`,
                          surface: "mobile-menu",
                        });
                        onClose();
                      }}
                    >
                      {nav[node.labelKey]}
                    </Link>
                  ) : (
                    <span className="menu-item">{nav[node.labelKey]}</span>
                  )}

                  {hasChildren ? (
                    <button
                      type="button"
                      className="menu-disclosure"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      aria-label={`${nav[node.labelKey]} — ${nav.sectionsLabel}`}
                      onClick={() => setExpanded(isOpen ? null : node.id)}
                    >
                      {/* Rotates rather than swapping glyph, so the control
                          reads the same in both directions. */}
                      <span aria-hidden="true" data-open={isOpen}>
                        ⌄
                      </span>
                    </button>
                  ) : null}
                </div>

                {hasChildren && isOpen ? (
                  <ul id={panelId} className="menu-sublist">
                    {node.children?.map((child) => {
                      const childHref = hrefFor(locale, child, node);
                      const label = nav.groups[child.labelKey];
                      return (
                        <li key={child.id}>
                          {childHref !== null ? (
                            <Link
                              href={childHref}
                              className="menu-subitem"
                              onClick={onClose}
                            >
                              {label}
                            </Link>
                          ) : (
                            <span
                              className="menu-subitem menu-subitem-planned"
                              aria-disabled="true"
                            >
                              {label}
                              <span className="mega-badge type-label">
                                {nav.comingSoon}
                              </span>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="menu-footer">
          <div className="flex items-center gap-2">
            <LocaleToggle current={locale} label={nav.localeToggle} />
            <ThemeToggle
              label={nav.themeToggle}
              names={{
                system: nav.themeSystem,
                light: nav.themeLight,
                dark: nav.themeDark,
              }}
            />
          </div>
          <Link
            href={ctaHref(locale)}
            className="btn btn-primary"
            onClick={() => {
              track("cta_click", { id: "nav.cta", surface: "mobile-menu" });
              onClose();
            }}
          >
            {nav.cta}
          </Link>
        </div>
      </nav>
    </div>
  );
}
