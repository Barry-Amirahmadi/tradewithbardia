import {
  getConcept,
  isTradingConceptId,
  type TradingConceptId,
} from "./concepts";
import { getSetup, setupsForConcept, type Setup } from "./setups";

/**
 * THE ACADEMY LESSON MODEL — master prompt §4, §6, §9, §17, §19.
 *
 * The Academy teaches concepts. It does not define them.
 *
 * `conceptIds` holds canonical `TradingConceptId` values, exactly as the Setup
 * Lab does, so "liquidity" is one identity across the story, the setups, the
 * lessons and search. A lesson that references a concept which does not exist
 * throws at module load — the same rule EPIC 04 established and EPIC 05
 * inherited, now with a third consumer proving it holds.
 *
 * Two relationships are DERIVED rather than authored, because a hand-written
 * copy of either would drift:
 *
 * - **Related setups** come from `setupsForConcept()`. A lesson never lists
 *   setup ids; it asks which setups use the concepts it teaches (§19). Adding
 *   a setup that uses `liquidity` makes it appear in the liquidity lesson with
 *   no edit here.
 * - **Concept prerequisites** come from the concept graph. A lesson declares
 *   the lessons that precede it, and an assertion below checks that this
 *   ordering is *compatible* with the canonical concept prerequisites — so the
 *   two graphs cannot disagree about what has to be understood first (§9).
 */

export const lessonLevels = ["foundation", "core", "applied"] as const;
export type LessonLevel = (typeof lessonLevels)[number];

/**
 * The teaching sequence from §7. Data rather than markup, so the lesson page
 * renders a loop and a section missing in either language is a test failure.
 */
export const lessonSections = ["explain", "visualize", "apply", "check"] as const;
export type LessonSection = (typeof lessonSections)[number];

export interface Lesson {
  id: string;
  slug: string;
  /** Canonical concepts taught here. Never redefined locally. */
  conceptIds: readonly TradingConceptId[];
  /** Lessons that must come first. Checked against the concept graph below. */
  prerequisites: readonly string[];
  level: LessonLevel;
  /** Reading minutes. An estimate of length, never a claim about outcomes. */
  minutes: number;
  /**
   * Where in the shared hero scene this lesson's idea is visible, 0..1.
   *
   * The Academy adds no chart engine and no scene data (§13). It renders the
   * existing `heroScene` through the existing static renderer at the beat that
   * shows the concept being taught — so the liquidity lesson shows the sweep
   * forming, and the risk lesson shows entry, stop and target together. One
   * server-rendered figure per lesson page, zero canvas instances.
   */
  visualProgress: number;
}

const list: readonly Lesson[] = [
  {
    id: "market-and-noise",
    slug: "market-and-noise",
    conceptIds: ["market", "context"],
    prerequisites: [],
    level: "foundation",
    minutes: 6,
    visualProgress: 0.15,
  },
  {
    id: "market-structure",
    slug: "market-structure",
    conceptIds: ["structure", "bos", "mss"],
    prerequisites: ["market-and-noise"],
    level: "foundation",
    minutes: 9,
    visualProgress: 0.58,
  },
  {
    id: "liquidity",
    slug: "liquidity",
    conceptIds: ["liquidity", "equalHighs", "equalLows", "sweep"],
    prerequisites: ["market-and-noise"],
    level: "foundation",
    minutes: 8,
    visualProgress: 0.36,
  },
  {
    id: "displacement-and-imbalance",
    slug: "displacement-and-imbalance",
    conceptIds: ["displacement", "fvg"],
    prerequisites: ["market-structure"],
    level: "core",
    minutes: 7,
    visualProgress: 0.70,
  },
  {
    id: "building-a-setup",
    slug: "building-a-setup",
    conceptIds: ["setup"],
    prerequisites: ["liquidity", "displacement-and-imbalance"],
    level: "core",
    minutes: 10,
    visualProgress: 0.76,
  },
  {
    id: "execution",
    slug: "execution",
    conceptIds: ["execution", "entry"],
    prerequisites: ["building-a-setup"],
    level: "applied",
    minutes: 8,
    visualProgress: 0.82,
  },
  {
    id: "risk",
    slug: "risk",
    conceptIds: ["risk", "invalidation", "positionSize"],
    prerequisites: ["execution"],
    level: "applied",
    minutes: 9,
    visualProgress: 0.86,
  },
  {
    id: "review-and-data",
    slug: "review-and-data",
    conceptIds: ["review", "data"],
    prerequisites: ["risk"],
    level: "applied",
    minutes: 7,
    visualProgress: 1,
  },
];

const byId = new Map(list.map((lesson) => [lesson.id, lesson]));

// ── Integrity, at module load ──────────────────────────────────────────────
{
  const slugs = new Set<string>();

  for (const lesson of list) {
    if (slugs.has(lesson.slug)) {
      throw new Error(`lessons: duplicate slug "${lesson.slug}".`);
    }
    slugs.add(lesson.slug);

    if (lesson.conceptIds.length === 0) {
      throw new Error(`lessons: "${lesson.id}" teaches no concepts.`);
    }
    for (const id of lesson.conceptIds) {
      if (!isTradingConceptId(id)) {
        throw new Error(
          `lessons: "${lesson.id}" references unknown concept "${id}".`,
        );
      }
    }
    for (const id of lesson.prerequisites) {
      if (!byId.has(id)) {
        throw new Error(
          `lessons: "${lesson.id}" requires unknown lesson "${id}".`,
        );
      }
      if (id === lesson.id) {
        throw new Error(`lessons: "${lesson.id}" requires itself.`);
      }
    }
    if (lesson.visualProgress < 0 || lesson.visualProgress > 1) {
      throw new Error(`lessons: "${lesson.id}" has an out-of-range visual.`);
    }
  }

  // Acyclic, or "what should I read first?" has no answer.
  const state = new Map<string, "open" | "done">();
  const walk = (id: string, trail: string[]): void => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "open") {
      throw new Error(`lessons: prerequisite cycle ${[...trail, id].join(" → ")}.`);
    }
    state.set(id, "open");
    for (const next of byId.get(id)?.prerequisites ?? []) walk(next, [...trail, id]);
    state.set(id, "done");
  };
  for (const lesson of list) walk(lesson.id, []);

  /**
   * The two graphs must agree. If a concept requires another concept, the
   * lesson teaching the first must not come before the lesson teaching the
   * second — otherwise the curriculum contradicts the canonical model and one
   * of them is wrong.
   */
  const lessonOf = new Map<TradingConceptId, string>();
  for (const lesson of list) {
    for (const id of lesson.conceptIds) lessonOf.set(id, lesson.id);
  }
  const position = new Map(list.map((lesson, index) => [lesson.id, index]));

  for (const lesson of list) {
    for (const conceptId of lesson.conceptIds) {
      for (const required of getConcept(conceptId).prerequisites) {
        const owner = lessonOf.get(required);
        if (owner === undefined || owner === lesson.id) continue;
        const here = position.get(lesson.id) ?? 0;
        const there = position.get(owner) ?? 0;
        if (there > here) {
          throw new Error(
            `lessons: "${lesson.id}" teaches "${conceptId}", which requires ` +
              `"${required}" — taught later in "${owner}". The curriculum ` +
              `contradicts the concept graph.`,
          );
        }
      }
    }
  }
}

export const lessons: readonly Lesson[] = list;

export function getLesson(slug: string): Lesson | undefined {
  return list.find((lesson) => lesson.slug === slug);
}

/** Reading order. The array order IS the curriculum; position is meaningful. */
export function lessonIndex(id: string): number {
  return list.findIndex((lesson) => lesson.id === id);
}

/** The next lesson, or undefined at the end. The curriculum does not loop. */
export function nextLesson(id: string): Lesson | undefined {
  const index = lessonIndex(id);
  return index < 0 ? undefined : list[index + 1];
}

export function previousLesson(id: string): Lesson | undefined {
  const index = lessonIndex(id);
  return index <= 0 ? undefined : list[index - 1];
}

/** Which lesson teaches a concept — the edge the Dictionary will want. */
export function lessonForConcept(id: TradingConceptId): Lesson | undefined {
  return list.find((lesson) => lesson.conceptIds.includes(id));
}

/**
 * Setups that use anything this lesson teaches. Derived, never authored, so
 * the Setup Lab stays the single source of truth for setup records (§19).
 */
export function setupsForLesson(lesson: Lesson): readonly Setup[] {
  const seen = new Map<string, Setup>();
  for (const conceptId of lesson.conceptIds) {
    for (const setup of setupsForConcept(conceptId)) {
      if (getSetup(setup.slug) !== undefined) seen.set(setup.slug, setup);
    }
  }
  return [...seen.values()];
}

/** Curriculum grouped by level, for the landing page's learning path. */
export function curriculum(): readonly { level: LessonLevel; lessons: readonly Lesson[] }[] {
  return lessonLevels
    .map((level) => ({ level, lessons: list.filter((l) => l.level === level) }))
    .filter((group) => group.lessons.length > 0);
}
