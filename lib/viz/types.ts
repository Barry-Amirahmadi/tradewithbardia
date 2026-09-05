/**
 * TRADING VISUALIZATION ENGINE — master prompt §21, §26, §50.
 *
 * One scene format, many renderers. The Hero, the Setup Lab, Trading Replay,
 * Academy lessons and the future dashboard all consume `TradingScene`; only
 * the renderer underneath changes. Adding WebGL later means one `dynamic()`
 * import and one `case` in `components/charts/TradingAnimation.tsx`, which is
 * the only file that knows renderer implementations by name.
 */

export interface Candle {
  /** Sequential index. Phase 0 scenes are index-based; real scenes will carry
   *  a timestamp here instead, which changes nothing for renderers. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/**
 * Where the numbers came from. This is not decoration — §26 and §77.1/§77.13
 * forbid presenting fabricated data as real, so provenance is a required
 * field on every scene and renderers are contractually required to surface
 * anything that is not `verified`. Making it non-optional means a future
 * contributor cannot quietly ship a chart that implies a track record.
 */
export type Provenance =
  /** Generated for illustration. Never implies a trade happened. */
  | "synthetic"
  /** Real market data under study, no validated edge claim attached. */
  | "research"
  /** Placeholder wiring for a not-yet-connected data source. */
  | "demo"
  /** Real, reconciled, sample-size checked. Nothing qualifies yet. */
  | "verified";

/**
 * Every provenance except `verified` obliges the UI to disclose what the
 * viewer is looking at. Expressing that as a type — rather than as a paragraph
 * someone remembers to paste next to each chart — means a disclosure component
 * cannot be constructed without a label for each disclosing state, and adding
 * a new provenance breaks the build until it has one in every language.
 */
export type DisclosingProvenance = Exclude<Provenance, "verified">;

export function requiresDisclosure(
  provenance: Provenance,
): provenance is DisclosingProvenance {
  return provenance !== "verified";
}

export type AnnotationTone = "long" | "short" | "neutral" | "accent";

export type Annotation =
  /** A horizontal pool of resting orders. */
  | {
      kind: "liquidity";
      id: string;
      price: number;
      fromIndex: number;
      toIndex: number;
      side: "buy" | "sell";
      label?: string;
    }
  /** The moment a liquidity level is taken. */
  | {
      kind: "sweep";
      id: string;
      index: number;
      price: number;
      label?: string;
    }
  /** The break that defines a market structure shift. */
  | {
      kind: "structure";
      id: string;
      price: number;
      fromIndex: number;
      toIndex: number;
      label?: string;
    }
  /** A price region: fair value gap, order block, range. */
  | {
      kind: "zone";
      id: string;
      fromIndex: number;
      toIndex: number;
      top: number;
      bottom: number;
      tone: AnnotationTone;
      label?: string;
    }
  /** Entry, stop or target. */
  | {
      kind: "level";
      id: string;
      price: number;
      fromIndex: number;
      toIndex: number;
      role: "entry" | "stop" | "target";
      label?: string;
    }
  /** A confirmed swing point. */
  | {
      kind: "swing";
      id: string;
      index: number;
      price: number;
      side: "high" | "low";
    };

/**
 * One beat of the scene, expressed against normalized scroll progress rather
 * than wall-clock time — §20 makes scroll the timeline, so a stage cannot own
 * a duration in milliseconds.
 */
export interface SceneStage {
  id: string;
  /** Normalized scene progress at which this stage begins / ends, 0..1. */
  start: number;
  end: number;
  /** Candle count revealed once this stage completes. */
  revealTo: number;
  /** Annotation ids that fade in across this stage. */
  reveals: readonly string[];
}

export interface TradingScene {
  id: string;
  provenance: Provenance;
  candles: readonly Candle[];
  annotations: readonly Annotation[];
  stages: readonly SceneStage[];
  /**
   * Candles already on screen before the first stage advances. Without it a
   * scroll-driven scene resolves to zero candles at rest and the hero opens on
   * an empty grid — technically faithful to the timeline, and useless as a
   * first impression (§19).
   */
  initialReveal?: number;
}

/** Renderers, strongest first. This order is the §50 fallback chain. */
export const rendererChain = [
  "webgl",
  "frames",
  "video",
  "canvas",
  "static",
] as const;

export type RendererId = (typeof rendererChain)[number];

/** §48 adaptive performance profiles. */
export type PerformanceProfile = "high" | "medium" | "low";

export interface TradingAnimationProps {
  scene: TradingScene;
  /** Normalized scene progress, 0..1. Driven by the scroll engine, never by
   *  React state — see §57 and lib/motion/scroll-engine.ts. */
  progress: number;
  /** Layout direction. Charts keep time running left-to-right even in RTL —
   *  price axes are a convention, not prose — but axis labels and captions
   *  follow the document direction (§17). */
  direction: "ltr" | "rtl";
  /** Accessible description for the figure. */
  description: string;
  className?: string;
  /**
   * Handed the imperative handle once the renderer is live. A callback rather
   * than a forwarded ref because renderers are code-split behind
   * `next/dynamic`, and a callback crosses that boundary without depending on
   * how the wrapper handles refs.
   */
  onReady?: (handle: TradingAnimationHandle) => void;
}

/**
 * Imperative handle a renderer exposes so the scroll engine can drive it
 * directly at animation frame rate, bypassing React entirely (§57).
 */
export interface TradingAnimationHandle {
  setProgress(progress: number): void;
  /** Release GPU / RAF resources when the section leaves the viewport (§49). */
  suspend(): void;
  resume(): void;
}
