"use client";

import { useEffect, type RefObject } from "react";

/**
 * DISMISSABLE LAYER — master prompt §3, §10, §17.
 *
 * The behaviour every overlay in this product owes the user: focus moves in,
 * focus is trapped while open, Escape closes, focus returns to whatever opened
 * it, and the page behind does not scroll.
 *
 * It exists once because the mobile menu and the command palette need
 * identical semantics, and a second hand-written focus trap is how one of them
 * ends up subtly wrong — usually the one nobody tests with a keyboard.
 *
 * Scroll locking compensates for the scrollbar's width so locking does not
 * shift the page sideways, which on a wide layout is a visible jump.
 */
export interface DismissableLayerOptions {
  open: boolean;
  onDismiss: () => void;
  containerRef: RefObject<HTMLElement | null>;
  /** Focused on open. Falls back to the first tabbable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Set false for layers that should not lock the page (e.g. a popover). */
  lockScroll?: boolean;
}

const TABBABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDismissableLayer({
  open,
  onDismiss,
  containerRef,
  initialFocusRef,
  lockScroll = true,
}: DismissableLayerOptions): void {
  // Scroll lock. Separate effect from focus so a layer can opt out of one
  // without losing the other.
  useEffect(() => {
    if (!open || !lockScroll) return;

    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingInlineEnd;
    const scrollbar = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbar > 0) {
      // Logical property: on an RTL page the scrollbar sits on the left, and
      // padding-right would compensate on the wrong side.
      body.style.paddingInlineEnd = `${scrollbar}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingInlineEnd = previousPadding;
    };
  }, [open, lockScroll]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (container === null) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Defer one frame: the layer may still be animating in, and focusing an
    // element mid-transition can make the browser scroll to it.
    const focusFrame = requestAnimationFrame(() => {
      const target =
        initialFocusRef?.current ??
        container.querySelector<HTMLElement>(TABBABLE);
      target?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;

      // Re-queried on every Tab rather than captured once: the palette's
      // tabbable set changes as results come and go, and a stale list traps
      // focus on an element that no longer exists.
      const focusables = [
        ...container.querySelectorAll<HTMLElement>(TABBABLE),
      ].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;

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
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      // Only restore focus if it is still inside the layer being torn down —
      // otherwise we would steal it back from wherever the user has moved on to.
      if (container.contains(document.activeElement)) {
        previouslyFocused?.focus();
      }
    };
  }, [open, onDismiss, containerRef, initialFocusRef]);
}
