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
): void {
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    let last = -1;

    const unsubscribe = onFrame(() => {
      const rect = element.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;

      // A section shorter than the viewport has no scrub distance of its own;
      // treat it as complete rather than dividing by zero.
      const progress =
        distance <= 0 ? 1 : clamp01(-rect.top / distance);

      if (Math.abs(progress - last) < 0.0002) return;
      last = progress;
      onProgress(progress);
    });

    return unsubscribe;
  }, [ref, onProgress]);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
