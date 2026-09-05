"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { primaryNav } from "@/lib/navigation";

interface Props {
  locale: Locale;
  nav: Dictionary["nav"];
  onClose: () => void;
}

/**
 * Full-screen cinematic menu — master prompt §52.
 *
 * Not a drawer. Typography stagger and a clip reveal, driven by CSS keyframes
 * with a per-item delay so the whole thing costs no JavaScript beyond mount.
 *
 * The focus handling below is not polish: a full-screen overlay that leaves
 * focus behind it is unusable with a keyboard or a screen reader (§63).
 */
export default function MobileMenu({ locale, nav, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    focusables[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      id="mobile-menu"
      className="menu-overlay lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={nav.primaryLabel}
    >
      <nav className="container-page">
        {primaryNav.map((item, index) => (
          <Link
            key={item.key}
            href={`/${locale}/${item.segment}`}
            className={`menu-item${item.pending ? " nav-pending" : ""}`}
            style={{ ["--i" as string]: index }}
            onClick={onClose}
          >
            {nav[item.key]}
          </Link>
        ))}

        <div
          className="mt-12 flex items-center gap-3"
          style={{ ["--i" as string]: primaryNav.length }}
        >
          <Link href={`/${locale}/learn`} className="btn btn-primary" onClick={onClose}>
            {nav.cta}
          </Link>
        </div>
      </nav>
    </div>
  );
}
