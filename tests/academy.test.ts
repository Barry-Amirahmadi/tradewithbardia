import assert from "node:assert/strict";
import { describe, it } from "node:test";

import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import fa from "../lib/i18n/dictionaries/fa.json" with { type: "json" };
import { createAcademyProvider } from "../lib/search/academy-provider";
import type { SearchContext } from "../lib/search/provider";
import { getConcept, isTradingConceptId, tradingConceptIds } from "../lib/trading/concepts";
import {
  curriculum,
  getLesson,
  lessonForConcept,
  lessonIndex,
  lessonLevels,
  lessons,
  lessonSections,
  nextLesson,
  previousLesson,
  setupsForLesson,
} from "../lib/trading/lessons";
import { getSetup, setups } from "../lib/trading/setups";

/**
 * EPIC 06 — the Free Academy.
 *
 * The assertions that matter are the ones keeping the Academy from becoming a
 * fourth vocabulary: every concept a lesson teaches must be canonical, and the
 * curriculum order must not contradict the concept prerequisite graph.
 */

describe("lesson model integrity", () => {
  it("every lesson references only canonical concept ids", () => {
    for (const lesson of lessons) {
      for (const id of lesson.conceptIds) {
        assert.ok(isTradingConceptId(id), `"${lesson.id}" → unknown concept "${id}"`);
      }
    }
  });

  it("the Academy defines no concepts of its own", () => {
    const canonical = new Set<string>(tradingConceptIds);
    for (const id of new Set(lessons.flatMap((l) => l.conceptIds))) {
      assert.ok(canonical.has(id));
    }
  });

  it("slugs are unique and URL-safe", () => {
    const seen = new Set<string>();
    for (const lesson of lessons) {
      assert.ok(!seen.has(lesson.slug), `duplicate slug "${lesson.slug}"`);
      seen.add(lesson.slug);
      assert.match(lesson.slug, /^[a-z0-9-]+$/);
    }
  });

  it("every prerequisite names a lesson that exists", () => {
    const ids = new Set(lessons.map((l) => l.id));
    for (const lesson of lessons) {
      for (const id of lesson.prerequisites) {
        assert.ok(ids.has(id), `"${lesson.id}" requires unknown lesson "${id}"`);
        assert.notEqual(id, lesson.id);
      }
    }
  });

  it("the prerequisite graph is acyclic", () => {
    const byId = new Map(lessons.map((l) => [l.id, l]));
    const state = new Map<string, string>();
    const walk = (id: string, trail: string[]): void => {
      if (state.get(id) === "done") return;
      assert.notEqual(state.get(id), "open", `cycle: ${[...trail, id].join(" → ")}`);
      state.set(id, "open");
      for (const next of byId.get(id)?.prerequisites ?? []) walk(next, [...trail, id]);
      state.set(id, "done");
    };
    for (const lesson of lessons) walk(lesson.id, []);
  });

  it("prerequisites always come earlier in the reading order", () => {
    for (const lesson of lessons) {
      for (const id of lesson.prerequisites) {
        assert.ok(
          lessonIndex(id) < lessonIndex(lesson.id),
          `"${lesson.id}" requires "${id}", which comes later`,
        );
      }
    }
  });

  it("the curriculum never contradicts the concept graph", () => {
    // The load-bearing test of this epic. If a concept requires another, the
    // lesson teaching it must not precede the lesson teaching the requirement.
    const lessonOf = new Map<string, string>();
    for (const lesson of lessons) {
      for (const id of lesson.conceptIds) lessonOf.set(id, lesson.id);
    }
    for (const lesson of lessons) {
      for (const conceptId of lesson.conceptIds) {
        for (const required of getConcept(conceptId).prerequisites) {
          const owner = lessonOf.get(required);
          if (owner === undefined || owner === lesson.id) continue;
          assert.ok(
            lessonIndex(owner) <= lessonIndex(lesson.id),
            `"${lesson.id}" teaches "${conceptId}" which requires "${required}", taught later in "${owner}"`,
          );
        }
      }
    }
  });

  it("visual progress stays inside the scene", () => {
    for (const lesson of lessons) {
      assert.ok(lesson.visualProgress >= 0 && lesson.visualProgress <= 1, lesson.id);
    }
  });

  it("every level in the curriculum has lessons and every lesson a level", () => {
    const groups = curriculum();
    assert.equal(groups.reduce((n, g) => n + g.lessons.length, 0), lessons.length);
    for (const group of groups) {
      assert.ok(lessonLevels.includes(group.level));
      assert.ok(group.lessons.length > 0);
    }
  });
});

describe("lesson navigation", () => {
  it("resolves next and previous, and the path does not loop", () => {
    const first = lessons[0];
    const last = lessons[lessons.length - 1];
    assert.ok(first !== undefined && last !== undefined);
    assert.equal(previousLesson(first.id), undefined, "the path has a beginning");
    assert.equal(nextLesson(last.id), undefined, "the path has an end, it does not wrap");
    assert.equal(nextLesson(first.id)?.id, lessons[1]?.id);
  });

  it("next and previous are inverses", () => {
    for (const lesson of lessons) {
      const next = nextLesson(lesson.id);
      if (next === undefined) continue;
      assert.equal(previousLesson(next.id)?.id, lesson.id);
    }
  });

  it("looks up by slug and rejects unknown ones", () => {
    assert.ok(getLesson("liquidity") !== undefined);
    assert.equal(getLesson("no-such-lesson"), undefined);
    assert.equal(lessonIndex("no-such-lesson"), -1);
  });

  it("every canonical concept is taught by some lesson", () => {
    // Not strictly required, but a concept with no lesson is a gap in the
    // curriculum worth failing on while the set is small enough to fix.
    for (const id of tradingConceptIds) {
      assert.ok(lessonForConcept(id) !== undefined, `no lesson teaches "${id}"`);
    }
  });
});

describe("setup integration", () => {
  it("related setups are derived from the concept graph, not authored", () => {
    const liquidity = lessons.find((l) => l.id === "liquidity");
    assert.ok(liquidity !== undefined);
    const related = setupsForLesson(liquidity);
    assert.ok(related.length > 0);
    for (const setup of related) {
      const shares = setup.conceptIds.some((id) => liquidity.conceptIds.includes(id));
      assert.ok(shares, `"${setup.id}" shares no concept with the lesson`);
    }
  });

  it("every derived setup is a real record in the Setup Lab", () => {
    for (const lesson of lessons) {
      for (const setup of setupsForLesson(lesson)) {
        assert.ok(getSetup(setup.slug) !== undefined, `dangling setup "${setup.slug}"`);
      }
    }
  });

  it("no lesson embeds a setup object", () => {
    // §19: reference setup ids, never copy the records.
    const serialised = JSON.stringify(lessons);
    for (const setup of setups) {
      assert.ok(!serialised.includes(setup.slug), `lesson data embeds "${setup.slug}"`);
    }
  });
});

describe("localization completeness", () => {
  for (const [name, dict] of [["en", en], ["fa", fa]] as const) {
    it(`${name}: every lesson has a title, summary, all sections and takeaways`, () => {
      for (const lesson of lessons) {
        const copy = dict.academy.lessons[lesson.id as keyof typeof dict.academy.lessons];
        assert.ok(copy !== undefined, `${name} is missing lesson "${lesson.id}"`);
        assert.ok(copy.title.length > 0);
        assert.ok(copy.summary.length > 0);
        for (const section of lessonSections) {
          assert.ok(copy[section].length > 0, `${name}.${lesson.id}.${section} is empty`);
        }
        assert.ok(copy.takeaways.length >= 2, `${name}.${lesson.id} has too few takeaways`);
        for (const takeaway of copy.takeaways) assert.ok(takeaway.length > 0);
      }
    });

    it(`${name}: every level has a label`, () => {
      for (const lesson of lessons) {
        assert.ok(dict.academy.levels[lesson.level]);
      }
    });
  }

  it("carries no orphan lesson copy", () => {
    const known = new Set(lessons.map((l) => l.id));
    for (const key of Object.keys(en.academy.lessons)) {
      assert.ok(known.has(key), `academy.lessons.${key} has copy but no lesson`);
    }
  });

  it("Persian academy copy contains no parentheses", () => {
    const blob = JSON.stringify(fa.academy);
    assert.ok(!blob.includes("("));
    assert.ok(!blob.includes(")"));
  });

  it("promises no certification and no guaranteed outcome", () => {
    // §21 and §8. The Academy is free education, not an accreditation.
    const banned = [
      "certificate", "certification", "accredited", "diploma", "guaranteed",
      "win rate", "profit factor", "risk-free",
    ];
    const blob = JSON.stringify(en.academy).toLowerCase();
    for (const phrase of banned) {
      assert.ok(!blob.includes(phrase), `academy copy contains "${phrase}"`);
    }
  });

  it("both locales describe the same lessons", () => {
    assert.deepEqual(
      Object.keys(en.academy.lessons).sort(),
      Object.keys(fa.academy.lessons).sort(),
    );
  });
});

describe("route generation", () => {
  it("every lesson produces a static path in both locales", () => {
    const params = ["en", "fa"].flatMap((locale) =>
      lessons.map((lesson) => ({ locale, slug: lesson.slug })),
    );
    assert.equal(params.length, lessons.length * 2);
    for (const { slug } of params) assert.ok(getLesson(slug) !== undefined);
  });
});

describe("academy search provider", () => {
  const ctx: SearchContext = {
    locale: "en",
    labels: {
      pages: en.nav.resultsPages,
      commands: en.nav.resultsCommands,
      comingSoon: en.nav.comingSoon,
      toggleTheme: en.nav.cmdToggleTheme,
      switchLanguage: en.nav.cmdSwitchLanguage,
      scrollTop: en.nav.cmdScrollTop,
    },
  };
  const provider = createAcademyProvider(async () => ({
    academy: en.academy,
    concepts: en.concepts,
  }));

  it("does not load its index until something is searched", async () => {
    let loads = 0;
    const counted = createAcademyProvider(async () => {
      loads += 1;
      return { academy: en.academy, concepts: en.concepts };
    });
    assert.equal(loads, 0, "creating a provider must not fetch its data");
    await counted.search("risk", ctx);
    assert.equal(loads, 1);
    await counted.search("liquidity", ctx);
    assert.equal(loads, 1, "the index must be fetched once per session");
  });

  it("returns canonical lesson ids and real routes", async () => {
    const results = await provider.search("market structure", ctx);
    const hit = results.find((r) => r.id === "lesson.market-structure");
    assert.ok(hit !== undefined);
    assert.equal(hit.href, "/en/academy/market-structure");
  });

  it("finds a lesson by a concept it teaches, not just by its title", async () => {
    // "sweep" does not appear in the liquidity lesson's title; the canonical
    // vocabulary is what connects them.
    const results = await provider.search("sweep", ctx);
    assert.ok(results.some((r) => r.id === "lesson.liquidity"));
  });

  it("returns nothing for a genuine miss", async () => {
    assert.equal((await provider.search("zzzznotathing", ctx)).length, 0);
  });
});
