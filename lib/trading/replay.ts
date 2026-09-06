import { normalizeProgress } from "../viz/scene-state";

/**
 * THE REPLAY TIMELINE — master prompt §9.
 *
 * A cinematic educational replay, not an interactive trading game: the viewer
 * moves through a setup's reasoning, they do not take a position.
 *
 * Pure and deterministic, exactly like the hero timeline and for the same
 * reason — replay state must be a function of one number so that forward
 * playback, reverse, scrubbing, a paused resize and a restored position all
 * produce identical output. Nothing here keeps history.
 *
 * It reuses `normalizeProgress`, so NaN, overshoot and negative input behave
 * the same here as everywhere else in the product. There is deliberately no
 * clamping logic of its own to get subtly wrong.
 */

export const replayStages = [
  "market",
  "context",
  "liquidity",
  "structure",
  "trigger",
  "entry",
  "invalidation",
  "outcome",
  "review",
] as const;

export type ReplayStageId = (typeof replayStages)[number];

export interface ReplayState {
  stage: ReplayStageId;
  index: number;
  /** Progress within the active stage, 0..1. */
  stageProgress: number;
  /** Normalized overall progress, 0..1. Always finite. */
  progress: number;
}

const COUNT = replayStages.length;

export function replayStateAt(progress: number): ReplayState {
  const p = normalizeProgress(progress);
  // `p === 1` must land on the last stage, not one past the end.
  const index = Math.min(Math.floor(p * COUNT), COUNT - 1);
  const stage = replayStages[index];
  if (stage === undefined) {
    throw new Error("replay: no stages declared.");
  }
  const start = index / COUNT;
  return {
    stage,
    index,
    stageProgress: normalizeProgress((p - start) * COUNT),
    progress: p,
  };
}

/** Progress at which a stage begins — used to seek from the stage list. */
export function progressForStage(stage: ReplayStageId): number {
  const index = replayStages.indexOf(stage);
  if (index < 0) throw new Error(`replay: unknown stage "${String(stage)}".`);
  return index / COUNT;
}

/**
 * Advance by one stage, clamped rather than wrapping.
 *
 * Unlike the trading system loop, a replay has an end: it is one trade being
 * walked through, and looping it back to the start would imply the position
 * was re-entered.
 */
export function stepStage(current: ReplayStageId, delta: 1 | -1): ReplayStageId {
  const index = replayStages.indexOf(current);
  const next = Math.min(Math.max(index + delta, 0), COUNT - 1);
  return replayStages[next] ?? current;
}

/**
 * How far a playback head has travelled after `elapsed` ms.
 *
 * Time is converted to progress here rather than inside a component, so the
 * component owns no timeline arithmetic and the pacing can be tested without
 * a browser. Playback is linear on purpose — easing a teaching replay makes
 * the viewer's sense of duration unreliable.
 */
export const REPLAY_DURATION_MS = 18_000;

export function progressAfter(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return normalizeProgress(elapsedMs / REPLAY_DURATION_MS);
}
