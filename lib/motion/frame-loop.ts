/**
 * One animation frame loop for the whole application — master prompt §56.
 *
 * Every scroll-driven component subscribes here instead of calling
 * requestAnimationFrame itself. With a per-component loop, ten sections mean
 * ten independent callbacks each reading layout, and the browser interleaves
 * their reads and writes into a thrashing pattern. One loop means one read
 * phase per frame.
 */

type FrameCallback = (time: number) => void;

const callbacks = new Set<FrameCallback>();
let frameId: number | null = null;

function tick(time: number): void {
  frameId = requestAnimationFrame(tick);
  for (const callback of callbacks) callback(time);
}

/** Returns an unsubscribe function. The loop stops when the last one leaves. */
export function onFrame(callback: FrameCallback): () => void {
  callbacks.add(callback);
  if (frameId === null) frameId = requestAnimationFrame(tick);

  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0 && frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The preference is live, not a one-time reading. Someone who turns motion
 * down mid-session because a page is making them ill should not have to
 * reload to be believed, so this is exposed as a store the hero subscribes to.
 */
export function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
