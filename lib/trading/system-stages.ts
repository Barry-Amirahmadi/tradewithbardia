import { normalizeProgress } from "../viz/scene-state";
import { tradingConceptIds, type TradingConceptId } from "./concepts";

/**
 * THE TRADING SYSTEM STAGE MODEL — master prompt §1, §3, §18.
 *
 * Nine stages, closing back onto the first. The loop is the argument: a setup
 * is not the system, it is one stage inside a process that feeds its own
 * output back into its input.
 *
 * A stage IS a concept. There is no separate `stageId` union shadowing
 * `TradingConceptId`, because two ids for one idea is exactly the duplication
 * §4 forbids — the Setup Lab tagging a setup with `"liquidity"` and this
 * section highlighting stage `"liquidity"` must be the same string.
 *
 * Progress resolution reuses `normalizeProgress` from the visualization
 * engine rather than reimplementing clamping. That is not tidiness: it is why
 * NaN, overshoot and reverse scrolling behave identically here and in the
 * hero, and why there is one place to fix if they ever do not (§9).
 */

export const systemStageIds = [
  "market",
  "context",
  "liquidity",
  "structure",
  "setup",
  "execution",
  "risk",
  "review",
  "data",
] as const;

export type SystemStageId = (typeof systemStageIds)[number];

export interface SystemStage {
  id: SystemStageId;
  /** 0-based position in the loop. */
  index: number;
  /** Normalized progress range this stage occupies, 0..1. */
  start: number;
  end: number;
  /**
   * Concepts this stage introduces, the stage's own id first. This is the
   * join that makes the section data-driven: the copy comes from the
   * dictionary keyed by these ids, and search indexes the same list.
   */
  conceptIds: readonly TradingConceptId[];
}

/**
 * Concepts surfaced at each stage. Kept deliberately short — §4 of the hero
 * brief applies here too: an annotation explosion teaches nothing, so a stage
 * names at most two mechanisms beyond itself.
 */
const stageConcepts: Record<SystemStageId, readonly TradingConceptId[]> = {
  market: [],
  context: [],
  liquidity: ["equalHighs", "sweep"],
  structure: ["bos", "mss"],
  setup: ["displacement", "fvg"],
  execution: ["entry"],
  risk: ["invalidation", "positionSize"],
  review: [],
  data: [],
};

/**
 * Stages tile 0..1 evenly. Even spacing rather than hand-tuned weights because
 * every stage carries one idea of roughly equal weight — unlike the hero,
 * where the sweep needs longer than the opening range. If that stops being
 * true, change the table, not the resolver.
 */
export const systemStages: readonly SystemStage[] = systemStageIds.map(
  (id, index) => ({
    id,
    index,
    start: index / systemStageIds.length,
    end: (index + 1) / systemStageIds.length,
    conceptIds: [id, ...stageConcepts[id]],
  }),
);

const stageById = new Map<SystemStageId, SystemStage>(
  systemStages.map((stage) => [stage.id, stage]),
);

// Integrity at load: every concept a stage claims must exist, and the stage
// ids must themselves be concepts. A stage naming a concept that was renamed
// should stop the build rather than render an empty definition.
{
  const declared = new Set<string>(tradingConceptIds);
  for (const stage of systemStages) {
    for (const conceptId of stage.conceptIds) {
      if (!declared.has(conceptId)) {
        throw new Error(
          `system-stages: stage "${stage.id}" references unknown concept "${conceptId}".`,
        );
      }
    }
  }
}

export function getStage(id: SystemStageId): SystemStage {
  const stage = stageById.get(id);
  if (stage === undefined) {
    throw new Error(`system-stages: unknown stage "${String(id)}".`);
  }
  return stage;
}

/**
 * Which stage a scroll position belongs to.
 *
 * Out-of-range and non-finite input resolve safely because they pass through
 * `normalizeProgress` first — scroll positions arrive from anywhere, including
 * a restored session, a jump link and a resize mid-gesture (§9).
 */
export function stageAt(progress: number): SystemStage {
  const p = normalizeProgress(progress);
  const last = systemStages[systemStages.length - 1];
  if (last === undefined) throw new Error("system-stages: no stages declared.");

  for (const stage of systemStages) {
    if (p < stage.end) return stage;
  }
  return last;
}

/** How far through its own stage a position sits, 0..1. */
export function stageProgressAt(progress: number): number {
  const p = normalizeProgress(progress);
  const stage = stageAt(p);
  const span = stage.end - stage.start;
  return span > 0 ? normalizeProgress((p - stage.start) / span) : 1;
}

/**
 * The stage after this one, wrapping. The wrap is the point of the section —
 * `data` returns to `market`, which is what makes it a system rather than a
 * checklist — so it is expressed here rather than drawn as an arrow in one
 * component and forgotten in the next.
 */
export function nextStage(id: SystemStageId): SystemStage {
  const stage = getStage(id);
  const next = systemStages[(stage.index + 1) % systemStages.length];
  if (next === undefined) throw new Error("system-stages: no stages declared.");
  return next;
}

export function previousStage(id: SystemStageId): SystemStage {
  const stage = getStage(id);
  const count = systemStages.length;
  const previous = systemStages[(stage.index - 1 + count) % count];
  if (previous === undefined) {
    throw new Error("system-stages: no stages declared.");
  }
  return previous;
}
