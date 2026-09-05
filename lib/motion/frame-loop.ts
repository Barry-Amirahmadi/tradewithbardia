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
