"use client";

import dynamic from "next/dynamic";

import type { RendererId, TradingAnimationProps } from "@/lib/viz/types";

/**
 * RENDERER REGISTRY / FAÇADE — master prompt §21, §50.
 *
 * The single file in the application that knows renderer implementations by
 * name. Scene consumers render `<TradingAnimation renderer={id} …/>` and never
 * mention canvas, WebGL, frames or video.
 *
 * Adding `RealChart`, `FrameSequence`, `VideoSequence` or a WebGL renderer is
 * two edits *here*: one `dynamic()` import and one `case`. No section, no page
 * and no scene changes — which is the property that keeps §21's abstraction
 * from being decorative.
 *
 * The branches are explicit rather than a lookup map on purpose. A map indexed
 * at render time produces a component reference React's compiler cannot prove
 * is stable, and an unstable component type remounts its subtree and drops all
 * of the renderer's internal state on every render.
 */

const CanvasTradingAnimation = dynamic(
  () => import("@/lib/viz/canvas-renderer"),
  { ssr: false },
);

// Phase 2+, each one line:
// const WebglTradingAnimation = dynamic(() => import("@/lib/viz/webgl-renderer"), { ssr: false });
// const FrameSequenceAnimation = dynamic(() => import("@/lib/viz/frame-sequence-renderer"), { ssr: false });

/**
 * Renderers with a client implementation registered above. `static` is not
 * listed: it is a server component rendered above the client boundary and
 * passed down as children, which keeps its markup out of the client bundle.
 */
export const implementedRenderers = ["canvas"] as const;

export const availableRenderers: ReadonlySet<RendererId> = new Set<RendererId>([
  ...implementedRenderers,
  "static",
]);

/** True when the id has a client implementation, i.e. `<TradingAnimation>`
 *  will render something rather than deferring to the static fallback. */
export function hasClientRenderer(id: RendererId): boolean {
  return (implementedRenderers as readonly RendererId[]).includes(id);
}

interface Props extends TradingAnimationProps {
  renderer: RendererId;
}

export default function TradingAnimation({ renderer, ...props }: Props) {
  switch (renderer) {
    case "canvas":
      return <CanvasTradingAnimation {...props} />;

    // case "webgl":
    //   return <WebglTradingAnimation {...props} />;
    // case "frames":
    //   return <FrameSequenceAnimation {...props} />;

    default:
      // `static`, or a tier with no client implementation yet: the server
      // already rendered the fallback, so there is nothing to mount.
      return null;
  }
}
