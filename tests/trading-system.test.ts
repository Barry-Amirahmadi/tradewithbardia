import assert from "node:assert/strict";
import { describe, it } from "node:test";

import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import fa from "../lib/i18n/dictionaries/fa.json" with { type: "json" };
import { createConceptProvider } from "../lib/search/concept-provider";
import type { SearchContext } from "../lib/search/provider";
import {
  childrenOf,
  conceptsForSurface,
  getConcept,
  isTradingConceptId,
  tradingConceptIds,
  tradingConcepts,
  usedBy,
} from "../lib/trading/concepts";
import {
  getStage,
  nextStage,
  previousStage,
  stageAt,
  stageProgressAt,
  systemStageIds,
  systemStages,
} from "../lib/trading/system-stages";

/**
 * EPIC 04 — the canonical concept model and the stage loop.
 *
 * The point of these tests is architectural, not cosmetic: the whole value of
 * one canonical identity is that a dangling reference or a missing translation
 * fails loudly instead of rendering an empty definition three epics later.
 */

describe("canonical concept model", () => {
  it("every id has exactly one record", () => {
    assert.equal(tradingConcepts.length, tradingConceptIds.length);
    const seen = new Set(tradingConcepts.map((c) => c.id));
    assert.equal(seen.size, tradingConceptIds.length, "duplicate concept id");
  });

  it("every relationship points at a concept that exists", () => {
    const declared = new Set<string>(tradingConceptIds);
    for (const concept of tradingConcepts) {
      for (const ref of [
        ...concept.related,
        ...concept.prerequisites,
        ...(concept.parent === undefined ? [] : [concept.parent]),
      ]) {
        assert.ok(
          declared.has(ref),
          `"${concept.id}" references "${ref}", which does not exist`,
        );
      }
    }
  });

  it("no concept is its own parent, prerequisite or relation", () => {
    for (const concept of tradingConcepts) {
      assert.ok(!concept.related.includes(concept.id));
      assert.ok(!concept.prerequisites.includes(concept.id));
      assert.notEqual(concept.parent, concept.id);
    }
  });

  it("prerequisites are acyclic, so a learning path always terminates", () => {
    const state = new Map<string, string>();
    const walk = (id: string, trail: string[]): void => {
      if (state.get(id) === "done") return;
      assert.notEqual(
        state.get(id),
        "open",
        `prerequisite cycle: ${[...trail, id].join(" → ")}`,
      );
      state.set(id, "open");
      for (const next of getConcept(id as never).prerequisites) {
        walk(next, [...trail, id]);
      }
      state.set(id, "done");
    };
    for (const id of tradingConceptIds) walk(id, []);
  });

  it("derives children and usedBy rather than storing them", () => {
    // A stored inverse is a second copy that drifts. These are computed, so
    // they cannot disagree with `parent` / `prerequisites`.
    assert.deepEqual([...childrenOf("liquidity")].sort(), [
      "equalHighs",
      "equalLows",
      "sweep",
    ]);
    assert.ok(usedBy("market").includes("context"));
    assert.ok(!usedBy("market").includes("market"));
  });

  it("reports which future surface owns each concept", () => {
    const dictionary = conceptsForSurface("dictionary");
    assert.ok(dictionary.includes("mss"));
    assert.ok(dictionary.includes("fvg"));
    // Nothing claims a surface that does not exist yet beyond declaring intent.
    assert.ok(conceptsForSurface("setupLab").length > 0);
  });

  it("guards unknown ids at the boundary", () => {
    assert.ok(isTradingConceptId("liquidity"));
    assert.ok(!isTradingConceptId("liquidity-v2"));
    assert.throws(() => getConcept("nonsense" as never));
  });
});

describe("system stages", () => {
  it("has nine stages and they are concepts, not a parallel id set", () => {
    assert.equal(systemStages.length, 9);
    const conceptIds = new Set<string>(tradingConceptIds);
    for (const id of systemStageIds) {
      assert.ok(
        conceptIds.has(id),
        `stage "${id}" is not a canonical concept — the vocabulary has split`,
      );
    }
  });

  it("tiles 0..1 with no gaps or overlaps", () => {
    let cursor = 0;
    for (const stage of systemStages) {
      assert.equal(stage.start, cursor, `gap before "${stage.id}"`);
      assert.ok(stage.end > stage.start);
      cursor = stage.end;
    }
    assert.equal(Math.round(cursor * 1e9) / 1e9, 1);
  });

  it("indexes are sequential and match array order", () => {
    systemStages.forEach((stage, index) => assert.equal(stage.index, index));
  });

  it("every stage names its own concept first", () => {
    for (const stage of systemStages) {
      assert.equal(stage.conceptIds[0], stage.id);
    }
  });

  it("every referenced concept exists", () => {
    const declared = new Set<string>(tradingConceptIds);
    for (const stage of systemStages) {
      for (const id of stage.conceptIds) {
        assert.ok(declared.has(id), `stage "${stage.id}" → unknown "${id}"`);
      }
    }
  });

  it("closes the loop: data wraps back to market", () => {
    assert.equal(nextStage("data").id, "market");
    assert.equal(previousStage("market").id, "data");
    assert.equal(nextStage("market").id, "context");
  });
});

describe("stage lookup boundaries", () => {
  it("resolves the first and last stage at the extremes", () => {
    assert.equal(stageAt(0).id, "market");
    assert.equal(stageAt(1).id, "data");
    assert.equal(stageAt(0.999).id, "data");
  });

  it("clamps overshoot in both directions", () => {
    assert.equal(stageAt(-4).id, "market");
    assert.equal(stageAt(9).id, "data");
    assert.equal(stageAt(Number.POSITIVE_INFINITY).id, "data");
    assert.equal(stageAt(Number.NEGATIVE_INFINITY).id, "market");
  });

  it("resolves NaN to the first stage rather than propagating it", () => {
    assert.equal(stageAt(Number.NaN).id, "market");
    assert.ok(Number.isFinite(stageProgressAt(Number.NaN)));
  });

  it("names all nine stages in order across the range", () => {
    const seen: string[] = [];
    for (let p = 0; p <= 1.0001; p += 0.005) {
      const id = stageAt(p).id;
      if (seen[seen.length - 1] !== id) seen.push(id);
    }
    assert.deepEqual(seen, [...systemStageIds]);
  });

  it("reverse progression retraces the same stages", () => {
    const points = Array.from({ length: 101 }, (_, i) => i / 100);
    const forward = points.map((p) => stageAt(p).id);
    const backward = [...points].reverse().map((p) => stageAt(p).id).reverse();
    assert.deepEqual(backward, forward);
  });

  it("stage progress stays inside 0..1 everywhere", () => {
    for (let p = -0.5; p <= 1.5; p += 0.01) {
      const value = stageProgressAt(p);
      assert.ok(value >= 0 && value <= 1, `stageProgressAt(${p}) = ${value}`);
    }
  });

  it("rejects an unknown stage id loudly", () => {
    assert.throws(() => getStage("profit" as never));
  });
});

describe("localization completeness", () => {
  for (const [name, dict] of [["en", en], ["fa", fa]] as const) {
    it(`${name}: every stage has label, question and body`, () => {
      for (const id of systemStageIds) {
        const copy = dict.system.stages[id];
        assert.ok(copy !== undefined, `${name} is missing stage "${id}"`);
        for (const field of ["label", "question", "body"] as const) {
          assert.ok(
            copy[field].length > 0,
            `${name}.system.stages.${id}.${field} is empty`,
          );
        }
      }
    });

    it(`${name}: every concept has a term and a definition`, () => {
      for (const id of tradingConceptIds) {
        const copy = dict.concepts[id];
        assert.ok(copy !== undefined, `${name} is missing concept "${id}"`);
        assert.ok(copy.term.length > 0, `${name}.concepts.${id}.term is empty`);
        assert.ok(
          copy.definition.length > 0,
          `${name}.concepts.${id}.definition is empty`,
        );
      }
    });
  }

  it("carries no orphan copy for a concept that no longer exists", () => {
    const declared = new Set<string>(tradingConceptIds);
    for (const key of Object.keys(en.concepts)) {
      assert.ok(declared.has(key), `concepts.${key} has copy but no record`);
    }
  });

  it("Persian copy contains no parentheses", () => {
    // House rule: parentheses break RTL rendering in this product.
    const blob = JSON.stringify({ system: fa.system, concepts: fa.concepts });
    assert.ok(!blob.includes("("));
    assert.ok(!blob.includes(")"));
  });

  it("the two locales describe the same concepts, not different sets", () => {
    assert.deepEqual(Object.keys(en.concepts).sort(), Object.keys(fa.concepts).sort());
    assert.deepEqual(
      Object.keys(en.system.stages).sort(),
      Object.keys(fa.system.stages).sort(),
    );
  });
});

describe("concept search provider", () => {
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
  const provider = createConceptProvider(en.concepts, en.system);

  it("returns canonical concept ids, not display strings", () => {
    const results = provider.search("liquidity", ctx) as { id: string }[];
    assert.ok(results.some((r) => r.id === "concept.liquidity"));
  });

  it("finds a concept by its Latin abbreviation", () => {
    // A Persian reader types MSS in Latin; the term itself is Persian.
    const results = provider.search("MSS", ctx) as { id: string }[];
    assert.ok(results.some((r) => r.id === "concept.mss"));
  });

  it("links a mechanism to the stage where it is actually explained", () => {
    const results = provider.search("sweep", ctx) as {
      id: string;
      href?: string;
    }[];
    const hit = results.find((r) => r.id === "concept.sweep");
    assert.ok(hit !== undefined);
    assert.equal(hit.href, "/en#system-liquidity");
  });

  it("locale-prefixes the anchor", () => {
    const fahit = (
      createConceptProvider(fa.concepts, fa.system).search("نقدینگی", {
        ...ctx,
        locale: "fa",
      }) as { id: string; href?: string }[]
    ).find((r) => r.id === "concept.liquidity");
    assert.ok(fahit !== undefined);
    assert.equal(fahit.href, "/fa#system-liquidity");
  });

  it("returns nothing for a genuine miss rather than inventing a result", () => {
    const results = provider.search("guaranteed profit", ctx) as unknown[];
    assert.equal(results.length, 0);
  });
});
