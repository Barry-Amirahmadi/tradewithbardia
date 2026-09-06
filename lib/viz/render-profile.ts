import type { PerformanceProfile } from "./types";

/**
 * RENDER BUDGETS — master prompt §14, §47, §48.
 *
 * `capability.ts` decides *which renderer* a device gets. This decides *how
 * much that renderer is allowed to draw*, which until now nothing did: a
 * four-year-old phone on a 2G connection resolved to the canvas tier and then
 * drew exactly what a desktop drew. The profile existed and changed nothing.
 *
 * A budget is data, not behaviour, so the cost of each mode is legible in one
 * place and testable without a canvas. The rule the numbers follow: LOW keeps
 * the story — candles, structure, annotations, text, CTA — and gives up the
 * atmosphere; it never degrades to a blank page (§14).
 */
export interface RenderBudget {
  /** Ambient noise field behind the plot. The first thing to go. */
  atmosphere: boolean;
  /** Scatter points in that field. 0 disables it outright. */
  noisePoints: number;
  /** Device pixel ratio ceiling. Past 2 the cost climbs faster than fidelity. */
  maxDpr: number;
  /**
   * Per-frame camera easing, 0..1. Higher settles faster and therefore draws
   * fewer frames after scrolling stops — on a slow device a long glide is
   * dozens of full repaints nobody asked for.
   */
  cameraEasing: number;
  /** Horizontal price gridlines. */
  gridLines: number;
  /** Short mono tags on annotations — LIQ, SWEEP, MSS, FVG, ENTRY… */
  tags: boolean;
  /** Per-candle wick strokes. Off, bodies alone still read as a chart. */
  wicks: boolean;
}

/**
 * A compact viewport is not the same axis as a slow device: a fast phone gets
 * the full cinematic treatment at a lower density, and a slow desktop gets a
 * sparse one at full size. So density and capability are applied separately
 * rather than collapsed into a single "mobile" flag.
 */
export function renderBudget(
  profile: PerformanceProfile,
  compact = false,
): RenderBudget {
  const base: RenderBudget =
    profile === "high"
      ? {
          atmosphere: true,
          noisePoints: 260,
          maxDpr: 2,
          cameraEasing: 0.12,
          gridLines: 6,
          tags: true,
          wicks: true,
        }
      : profile === "medium"
        ? {
            atmosphere: true,
            noisePoints: 110,
            maxDpr: 1.75,
            cameraEasing: 0.18,
            gridLines: 5,
            tags: true,
            wicks: true,
          }
        : {
            atmosphere: false,
            noisePoints: 0,
            maxDpr: 1,
            cameraEasing: 0.3,
            gridLines: 4,
            tags: true,
            wicks: true,
          };

  if (!compact) return base;

  // Density, not capability: fewer gridlines and fewer points because there
  // are fewer pixels to spend, and a tighter DPR ceiling because a phone's
  // 3x display is where the fill-rate actually hurts.
  return {
    ...base,
    noisePoints: Math.round(base.noisePoints * 0.45),
    maxDpr: Math.min(base.maxDpr, 1.75),
    gridLines: Math.max(3, base.gridLines - 2),
  };
}
