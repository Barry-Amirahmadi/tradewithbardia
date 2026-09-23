"use client";

import { useEffect, type RefObject } from "react";

import { onFrame } from "./frame-loop";

/**
 * Normalized progress of a pinned section — master prompt §56, §57.
 *
 * The callback fires with a number in 0..1 describing how far the section has
 * travelled through its own scroll distance. It is deliberately a callback and
 * not a piece of state: turning scroll position into `setState` puts a React
 * render between the user's finger and the pixels, which §57 rules out.
 *
 * Nothing here reads `window.scrollY`. `getBoundingClientRect` already
 * accounts for smooth-scroll transforms, so this stays correct whether Lenis
 * is running or the browser is scrolling natively.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  onProgress: (progress: number) => void,
  /**
   * Set false to stop sampling entirely. Not the same as ignoring the value:
   * a section that is not scroll-driven — a hero collapsed for reduced motion,
   * say — should not be measuring layout every frame to feed a callback that
   * does nothing with it.
   */
  enabled = true,
): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null || !enabled) return;

    let last = -1;
    let unsubscribe: (() => void) | null = null;

    const sample = () => {
      const rect = element.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;

      // A section shorter than the viewport has no scrub distance of its own;
      // treat it as complete rather than dividing by zero.
      const progress =
        distance <= 0 ? 1 : clamp01(-rect.top / distance);

      if (Math.abs(progress - last) < 0.0002) return;
      last = progress;
      onProgress(progress);
    };

    /**
     * Sampling is bound to visibility — EPIC 10 §5.
     *
     * `getBoundingClientRect` forces a layout read, and this ran every frame
     * for every subscribed section whether or not that section was anywhere
     * near the viewport. On a page carrying two scrub sections that is two
     * forced layouts per frame paid for pixels nobody can see.
     *
     * The renderer already suspended itself off-screen; the measurement that
     * feeds it did not. This closes that gap at the source, so every current
     * and future caller inherits it rather than each remembering to.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        if (visible && unsubscribe === null) {
          // Sample once on entry so the first painted frame is already correct
          // rather than one frame stale.
          sample();
          unsubscribe = onFrame(sample);
        } else if (!visible && unsubscribe !== null) {
          unsubscribe();
          unsubscribe = null;
          // Settle to the end state the section was heading toward, so a
          // section scrolled past in one flick does not freeze mid-story.
          const rect = element.getBoundingClientRect();
          const settled = rect.top < 0 ? 1 : 0;
          if (settled !== last) {
            last = settled;
            onProgress(settled);
          }
        }
      },
      // The same margin the hero uses to wake its renderer, so measurement is
      // already running by the time anything is drawn.
      { rootMargin: "10% 0px" },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      unsubscribe?.();
    };
  }, [ref, onProgress, enabled]);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
