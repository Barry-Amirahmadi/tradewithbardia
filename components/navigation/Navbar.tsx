"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import LocaleToggle from "./LocaleToggle";
import MegaMenu from "./MegaMenu";
import MobileMenu from "./MobileMenu";
import ThemeToggle from "./ThemeToggle";
import { track } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { onFrame } from "@/lib/motion/frame-loop";
import { nextNavState, type NavState } from "@/lib/nav-state";
import {
  ctaHref,
  hrefFor,
  isNavItemActive,
  primaryNav,
} from "@/lib/navigation";

/**
 * GLOBAL NAVIGATION — master prompt §2, §3, §4, §19, §20.
 *
 * The bar renders from `primaryNav`; it contains no labels, no URLs and no
 * hardcoded list. Adding a destination or a mega menu is a change to the
 * navigation model, never to this file.
 *
 * Two kinds of state, deliberately kept apart:
 *
 *   Scroll state  changes every frame → written straight to `data-state` from
 *                 the shared frame loop, zero React renders (§19, §20).
 *   UI state      menu open, palette open, which mega panel is showing →
 *                 React, because these are discrete user intentions.
 *
 * The palette is code-split: a page that is never searched never downloads it.
 */

const CommandPalette = dynamic(() => import("./CommandPalette"), { ssr: false });

/** Grace period so a diagonal mouse path to the panel does not close it. */
const MEGA_CLOSE_DELAY = 120;

interface Props {
  locale: Locale;
  nav: Dictionary["nav"];
  concepts: Dictionary["concepts"];
  system: Dictionary["system"];
}

export default function Navbar({ locale, nav, concepts, system }: Props) {
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // Menu open is stored with the route it was opened on, so "any navigation
  // closes the menu" is derived rather than an effect firing setState on every
  // route change — and back/forward are covered, not just link clicks.
  const [menu, setMenu] = useState({ open: false, path: pathname });
  const menuOpen = menu.open && menu.path === pathname;
  const menuOpenRef = useRef(false);

  // Every open surface is stored with the route it was opened on, so
  // "navigating closes it" is a derived value rather than an effect that fires
  // setState on each route change. Back/forward are covered too, not just
  // clicks, and there is no cascading render on navigation.
  const [palette, setPalette] = useState({ open: false, path: pathname });
  const paletteOpen = palette.open && palette.path === pathname;

  const [mega, setMega] = useState<{ id: string | null; path: string }>({
    id: null,
    path: pathname,
  });
  const openMega = mega.path === pathname ? mega.id : null;

  const megaTimer = useRef<number | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement | null>());

  const setPaletteOpen = useCallback(
    (open: boolean) => setPalette({ open, path: pathname }),
    [pathname],
  );
  const setOpenMega = useCallback(
    (id: string | null) => setMega({ id, path: pathname }),
    [pathname],
  );

  useEffect(() => {
    menuOpenRef.current = menuOpen;
    const header = headerRef.current;
    if (menuOpen && header !== null) header.dataset.state = "menu-open";
  }, [menuOpen]);

  // Scroll → navigation state. The reducer is pure and unit-tested; this
  // effect only samples position and writes the resulting attribute.
  useEffect(() => {
    const header = headerRef.current;
    if (header === null) return;

    let lastY = window.scrollY;
    let state: NavState = window.scrollY < 24 ? "initial" : "scrolled";
    header.dataset.state = state;

    return onFrame(() => {
      const y = window.scrollY;
      const delta = y - lastY;
      const next = nextNavState({
        y,
        delta,
        menuOpen: menuOpenRef.current,
        current: state,
      });
      if (Math.abs(delta) > 0.5) lastY = y;
      if (next === state) return;
      state = next;
      header.dataset.state = next;
    });
  }, []);

  // ⌘K / Ctrl+K. `metaKey || ctrlKey` rather than a platform sniff, so the
  // shortcut works on whichever the user's keyboard actually has (§9).
  // Read through a ref so the listener is bound once rather than rebound on
  // every open/close.
  const paletteOpenRef = useRef(paletteOpen);
  useEffect(() => {
    paletteOpenRef.current = paletteOpen;
  }, [paletteOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen(!paletteOpenRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  const closeMenu = useCallback(() => {
    setMenu((current) => ({ ...current, open: false }));
    track("nav_close", { surface: "mobile-menu" });
  }, []);

  const scheduleMegaClose = useCallback(() => {
    if (megaTimer.current !== null) window.clearTimeout(megaTimer.current);
    megaTimer.current = window.setTimeout(
      () => setOpenMega(null),
      MEGA_CLOSE_DELAY,
    );
  }, [setOpenMega]);

  const cancelMegaClose = useCallback(() => {
    if (megaTimer.current !== null) window.clearTimeout(megaTimer.current);
    megaTimer.current = null;
  }, []);

  /**
   * Closing a mega panel has to answer "where does focus go?".
   *
   * The panel unmounts when it closes. If the keyboard user is inside it and
   * presses Escape, focus falls to `<body>` and the next Tab restarts from the
   * top of the document — the panel silently costs them their place. But if
   * the panel was opened by hovering and focus was never inside it, moving
   * focus would be a focus steal. So restore only when focus is actually
   * within this item.
   */
  const closeMega = useCallback(
    (id: string) => {
      const item = itemRefs.current.get(id);
      const restore = item?.contains(document.activeElement) ?? false;
      setOpenMega(null);
      if (restore) item?.querySelector<HTMLButtonElement>("button.nav-link")?.focus();
    },
    [setOpenMega],
  );

  /**
   * A panel opened by tapping has no `pointerleave` to close it, so without
   * this it would stay open with no way to dismiss it on a touch screen — the
   * desktop bar is shown from 1024px, which includes tablets.
   */
  useEffect(() => {
    if (openMega === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const header = headerRef.current;
      if (header !== null && header.contains(event.target as Node)) return;
      setOpenMega(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMega, setOpenMega]);

  useEffect(
    () => () => {
      if (megaTimer.current !== null) window.clearTimeout(megaTimer.current);
    },
    [],
  );

  return (
    <>
      <a href="#main" className="sr-only-focusable btn btn-primary absolute z-[300] m-4">
        {nav.skipToContent}
      </a>

      <header ref={headerRef} className="site-header" data-state="initial">
        <div className="container-page flex items-center justify-between gap-6">
          <Link
            href={`/${locale}`}
            className="site-brand"
            onClick={() => track("nav_click", { id: "nav.brand", surface: "desktop-nav" })}
          >
            {/* The full wordmark is the brand; on a narrow bar it costs more
                width than the controls it would push off screen, so the mark
                contracts rather than the navigation losing a control. */}
            <span className="brand-full">{nav.brand}</span>
            <span className="brand-short">{nav.brandShort}</span>
          </Link>

          <nav aria-label={nav.primaryLabel} className="hidden items-center gap-1 lg:flex">
            {primaryNav.map((node) => {
              const href = hrefFor(locale, node);
              const active = isNavItemActive(pathname, node);
              const hasChildren = node.children !== undefined;
              const panelId = `mega-${node.id}`;
              const isOpen = openMega === node.id;

              return (
                <div
                  key={node.id}
                  ref={(el) => {
                    itemRefs.current.set(node.id, el);
                  }}
                  className="nav-item"
                  onPointerEnter={(event) => {
                    // Hover intent is a mouse concept. On a touch screen
                    // `pointerenter` fires at touch-start, immediately before
                    // the click that toggles the panel — opening here would
                    // make the tap read as "already open" and close it again,
                    // so the menu could never be opened by tapping at all.
                    if (!hasChildren || event.pointerType !== "mouse") return;
                    cancelMegaClose();
                    setOpenMega(node.id);
                  }}
                  onPointerLeave={(event) => {
                    if (!hasChildren || event.pointerType !== "mouse") return;
                    scheduleMegaClose();
                  }}
                  // There is deliberately no focus-to-open handler. `focusin`
                  // fires before `click` — on a tap that meant the panel
                  // opened on focus and the click immediately toggled it shut,
                  // so it could never be opened by tapping. Enter, Space and
                  // ArrowDown all open it from the keyboard, which is the
                  // disclosure pattern anyway; auto-opening on Tab also forced
                  // every keyboard user through eight extra stops per section.
                  onBlurCapture={(event) => {
                    if (!hasChildren) return;
                    // Only close when focus actually leaves the item's subtree.
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                      setOpenMega(null);
                    }
                  }}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      className={`nav-link${active ? " nav-link-active" : ""}`}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      aria-current={active ? "page" : undefined}
                      onClick={() =>
                        isOpen ? closeMega(node.id) : setOpenMega(node.id)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setOpenMega(node.id);
                        }
                      }}
                    >
                      {nav[node.labelKey]}
                    </button>
                  ) : href !== null ? (
                    <Link
                      href={href}
                      className={`nav-link${active ? " nav-link-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={() =>
                        track("nav_click", { id: `nav.${node.id}`, surface: "desktop-nav" })
                      }
                    >
                      {nav[node.labelKey]}
                    </Link>
                  ) : null}

                  {hasChildren ? (
                    <MegaMenu
                      node={node}
                      locale={locale}
                      nav={nav}
                      pathname={pathname}
                      open={isOpen}
                      panelId={panelId}
                      onRequestClose={() => closeMega(node.id)}
                    />
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="search-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label={nav.search}
            >
              <span aria-hidden="true">⌕</span>
              <span className="search-trigger-text">{nav.search}</span>
              {/* Latin shortcut hint stays LTR inside RTL copy. */}
              <kbd className="search-kbd type-data" aria-hidden="true">
                ⌘K
              </kbd>
            </button>

            {/* Below the compact breakpoint these live in the drawer instead.
                Four 44px controls plus the wordmark do not fit a 390px bar,
                and the drawer is one tap away. */}
            <div className="nav-controls">
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
              className="btn btn-primary hidden lg:inline-flex"
              onClick={() => track("cta_click", { id: "nav.cta", surface: "desktop-nav" })}
            >
              {nav.cta}
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-icon lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? nav.closeMenu : nav.openMenu}
              onClick={() => {
                const next = !menuOpen;
                setMenu({ open: next, path: pathname });
                track(next ? "nav_open" : "nav_close", { surface: "mobile-menu" });
              }}
            >
              <span aria-hidden="true">{menuOpen ? "×" : "≡"}</span>
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <MobileMenu
          locale={locale}
          nav={nav}
          pathname={pathname}
          onClose={closeMenu}
          onOpenSearch={() => {
            closeMenu();
            setPaletteOpen(true);
          }}
        />
      ) : null}

      {/* Keyed on open so each opening is a fresh mount with an empty query —
          cheaper and less error-prone than clearing state from an effect. */}
      <CommandPalette
        key={paletteOpen ? "palette-open" : "palette-closed"}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        locale={locale}
        nav={nav}
        concepts={concepts}
        system={system}
      />
    </>
  );
}
