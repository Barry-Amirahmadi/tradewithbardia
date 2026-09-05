"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import LocaleToggle from "./LocaleToggle";
import MobileMenu from "./MobileMenu";
import ThemeToggle from "./ThemeToggle";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { onFrame } from "@/lib/motion/frame-loop";
import { primaryNav } from "@/lib/navigation";

type NavState = "initial" | "scrolled" | "hidden" | "menu-open";

/** Past this depth, hiding on downward scroll is welcome rather than jarring. */
const HIDE_AFTER = 240;
/** Ignore sub-pixel jitter and the rubber-band at the ends of the document. */
const DELTA_THRESHOLD = 4;

interface Props {
  locale: Locale;
  nav: Dictionary["nav"];
}

export default function Navbar({ locale, nav }: Props) {
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // Menu open/closed is UI state and belongs to React. Scroll state is not:
  // it changes every frame, so it is written straight to a data attribute and
  // never triggers a render (§57).
  //
  // The open flag is stored alongside the route it was opened on, which makes
  // "any navigation closes the menu" a derived value rather than an effect
  // that fires setState on every route change. Back/forward are covered too,
  // not just clicks on the menu's own links.
  const [menu, setMenu] = useState({ open: false, path: pathname });
  const menuOpen = menu.open && menu.path === pathname;
  const menuOpenRef = useRef(false);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
    const header = headerRef.current;
    if (menuOpen && header !== null) header.dataset.state = "menu-open";
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  useEffect(() => {
    const header = headerRef.current;
    if (header === null) return;

    let lastY = window.scrollY;
    let state: NavState = window.scrollY < 24 ? "initial" : "scrolled";
    header.dataset.state = state;

    return onFrame(() => {
      const y = window.scrollY;
      const delta = y - lastY;

      let next: NavState;
      if (menuOpenRef.current) {
        next = "menu-open";
      } else if (y < 24) {
        next = "initial";
      } else if (delta > DELTA_THRESHOLD && y > HIDE_AFTER) {
        next = "hidden";
      } else if (delta < -DELTA_THRESHOLD) {
        next = "scrolled";
      } else {
        next = state === "initial" ? "scrolled" : state;
      }

      if (Math.abs(delta) > 0.5) lastY = y;
      if (next === state) return;
      state = next;
      header.dataset.state = next;
    });
  }, []);

  const closeMenu = useCallback(
    () => setMenu((current) => ({ ...current, open: false })),
    [],
  );

  return (
    <>
      <a href="#main" className="sr-only-focusable btn btn-primary absolute z-[300] m-4">
        {nav.skipToContent}
      </a>

      <header ref={headerRef} className="site-header" data-state="initial">
        <div className="container-page flex items-center justify-between gap-6">
          <Link href={`/${locale}`} className="site-brand">
            {nav.brand}
          </Link>

          <nav
            aria-label={nav.primaryLabel}
            className="hidden items-center gap-7 lg:flex"
          >
            {primaryNav.map((item) => {
              const href = `/${locale}/${item.segment}`;
              return (
                <Link
                  key={item.key}
                  href={href}
                  className={`nav-link${item.pending ? " nav-pending" : ""}`}
                  aria-current={pathname === href ? "page" : undefined}
                >
                  {nav[item.key]}
                </Link>
              );
            })}
          </nav>

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
            <Link href={`/${locale}/learn`} className="btn btn-primary hidden lg:inline-flex">
              {nav.cta}
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-icon lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? nav.closeMenu : nav.openMenu}
              onClick={() => setMenu({ open: !menuOpen, path: pathname })}
            >
              <span aria-hidden="true">{menuOpen ? "×" : "≡"}</span>
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <MobileMenu locale={locale} nav={nav} onClose={closeMenu} />
      ) : null}
    </>
  );
}
