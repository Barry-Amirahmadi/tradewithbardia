"use client";

import Lenis from "lenis";
import { useEffect } from "react";

import { onFrame, prefersReducedMotion } from "@/lib/motion/frame-loop";

/**
 * Smooth scrolling — master prompt §13, §58.
 *
 * Lenis is the one motion dependency Phase 0 carries. It earns its place
 * because the hero is scrub-driven and raw wheel deltas are quantised: without
 * interpolation a mouse wheel jumps the scene four beats at a time and the
 * story is unreadable on desktop. Nothing else in Phase 0 needs a motion
 * library, so nothing else was added — §13's rule about dependencies applies
 * to the popular ones too.
 *
 * It is skipped entirely under `prefers-reduced-motion`. Hijacking scroll from
 * a user who has asked the platform to stop moving things is the exact
 * behaviour §58 exists to prevent.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      duration: 1.05,
      // Slightly long tail, no bounce — "slow, precise, fluid" (§54).
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      // Touch scrolling is already smooth and native momentum is better than
      // anything we would synthesise; overriding it makes mobile feel laggy.
      syncTouch: false,
    });

    const unsubscribe = onFrame((time) => {
      lenis.raf(time);
    });

    return () => {
      unsubscribe();
      lenis.destroy();
    };
  }, []);

  return null;
}
