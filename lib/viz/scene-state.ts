import type { SceneStage, TradingScene } from "./types";

/**
 * Pure progress → scene state resolution.
 *
 * Kept free of React, canvas and the DOM on purpose: the canvas renderer and
 * the server-rendered static fallback both call this, which is what guarantees
 * the two agree about what a given scroll position is supposed to show.
 */

export interface SceneState {
  stage: SceneStage;
  /** Progress within the active stage, 0..1. */
  stageProgress: number;
  /** Fractional so the newest candle can draw itself in rather than pop. */
  revealed: number;
  /** Annotation id → opacity, 0..1. */
  opacity: ReadonlyMap<string, number>;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function resolveSceneState(
  scene: TradingScene,
  progress: number,
): SceneState {
  const p = clamp01(progress);

  let index = scene.stages.length - 1;
  for (let i = 0; i < scene.stages.length; i += 1) {
    const stage = scene.stages[i];
    if (stage !== undefined && p < stage.end) {
      index = i;
      break;
    }
  }

  const stage = scene.stages[index];
  if (stage === undefined) {
    throw new Error(`scene "${scene.id}" has no stages`);
  }

  const span = stage.end - stage.start;
  const stageProgress = span > 0 ? clamp01((p - stage.start) / span) : 1;

  const previous = index > 0 ? scene.stages[index - 1] : undefined;
  const from = previous?.revealTo ?? scene.initialReveal ?? 0;
  const revealed = from + (stage.revealTo - from) * easeOut(stageProgress);

  // Anything revealed by an earlier stage is fully on. The active stage fades
  // its own annotations in over the first 45% of the stage so the label has
  // settled well before the beat ends.
  const opacity = new Map<string, number>();
  for (let i = 0; i < index; i += 1) {
    const past = scene.stages[i];
    if (past === undefined) continue;
    for (const id of past.reveals) opacity.set(id, 1);
  }
  const fade = clamp01(stageProgress / 0.45);
  for (const id of stage.reveals) opacity.set(id, easeOut(fade));

  return { stage, stageProgress, revealed, opacity };
}

/**
 * How many candle slots the horizontal axis is currently divided into.
 *
 * Fitting the REVEALED range rather than the whole scene is what keeps the
 * frame full at every point in the timeline. Laying all 66 slots out from the
 * start leaves the opening frame with nine candles pinned to one edge and
 * eighty percent dead space; fitting them means the chart opens zoomed in on
 * the market and eases out as context arrives — which is the §20 progression
 * happening in the camera rather than in spite of it.
 *
 * The floor stops the first few candles from inflating to absurd widths.
 */
export const MIN_SLOTS = 10;

export function slotCount(revealed: number): number {
  return Math.max(revealed, MIN_SLOTS);
}

/** Price bounds of the revealed portion, with headroom for annotations. */
export function visibleBounds(
  scene: TradingScene,
  revealed: number,
): { min: number; max: number } {
  const count = Math.max(2, Math.ceil(revealed));
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < count && i < scene.candles.length; i += 1) {
    const candle = scene.candles[i];
    if (candle === undefined) continue;
    if (candle.l < min) min = candle.l;
    if (candle.h > max) max = candle.h;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }

  const padding = Math.max((max - min) * 0.12, 0.5);
  return { min: min - padding, max: max + padding };
}
