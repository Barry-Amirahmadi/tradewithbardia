import assert from "node:assert/strict";
import { describe, it } from "node:test";

import en from "../lib/i18n/dictionaries/en.json" with { type: "json" };
import fa from "../lib/i18n/dictionaries/fa.json" with { type: "json" };
import type { SearchContext } from "../lib/search/provider";
import { createSetupProvider } from "../lib/search/setup-provider";
import { isTradingConceptId, tradingConceptIds } from "../lib/trading/concepts";
import {
  progressAfter,
  progressForStage,
  replayStages,
  replayStateAt,
  stepStage,
} from "../lib/trading/replay";
import {
  filterDimensions,
  filterSetups,
  getSetup,
  setupSections,
  setups,
  setupsForConcept,
} from "../lib/trading/setups";

/**
 * EPIC 05 — the Setup Laboratory.
 *
 * The load-bearing assertions here are the ones that keep the library honest:
 * a setup may not reference a concept that does not exist, may not ship
 * without copy in both languages, and may not claim evidence it does not have.
 */

describe("setup model integrity", () => {
  it("every setup references only canonical concept ids", () => {
    for (const setup of setups) {
      for (const id of [...setup.conceptIds, ...setup.prerequisites]) {
        assert.ok(
          isTradingConceptId(id),
          `"${setup.id}" references unknown concept "${id}"`,
        );
      }
    }
  });

  it("no setup invents a local concept vocabulary", () => {
    // Every id used by any setup must already be in the canonical union.
    const canonical = new Set<string>(tradingConceptIds);
    const used = new Set(setups.flatMap((s) => [...s.conceptIds, ...s.prerequisites]));
    for (const id of used) assert.ok(canonical.has(id));
  });

  it("slugs are unique and URL-safe", () => {
    const seen = new Set<string>();
    for (const setup of setups) {
      assert.ok(!seen.has(setup.slug), `duplicate slug "${setup.slug}"`);
      seen.add(setup.slug);
      assert.match(setup.slug, /^[a-z0-9-]+$/);
    }
  });

  it("no setup claims verified evidence, because none is verified", () => {
    // PROJECT_RULES §1. Zero backtests exist; a `verified` setup here would be
    // a fabricated performance claim wearing a status badge.
    for (const setup of setups) {
      assert.notEqual(setup.evidence.kind, "verified", setup.id);
    }
  });

  it("carries no performance fields at all", () => {
    // Structural, not stylistic: if the model has nowhere to put a win rate,
    // a component cannot render one by accident.
    const banned = ["winRate", "profitFactor", "expectancy", "sharpe", "drawdown", "pnl", "returns"];
    const serialised = JSON.stringify(setups);
    for (const field of banned) {
      assert.ok(!serialised.includes(field), `setup model exposes "${field}"`);
    }
  });

  it("looks up by slug and rejects unknown ones", () => {
    assert.ok(getSetup("liquidity-sweep-reversal") !== undefined);
    assert.equal(getSetup("no-such-setup"), undefined);
  });

  it("exposes the reverse edge from a concept back to its setups", () => {
    const liquidity = setupsForConcept("liquidity");
    assert.ok(liquidity.length > 0);
    for (const setup of liquidity) assert.ok(setup.conceptIds.includes("liquidity"));
    assert.equal(setupsForConcept("review").length, 0);
  });
});

describe("filter derivation", () => {
  it("derives dimensions from the data, never from a hardcoded list", () => {
    const dimensions = filterDimensions();
    const ids = dimensions.map((d) => d.id);
    // Only dimensions the data actually supports appear.
    for (const id of ids) {
      assert.ok(["instrument", "session", "timeframe", "difficulty", "concept"].includes(id));
    }
    for (const dimension of dimensions) {
      assert.ok(dimension.values.length > 1, `"${dimension.id}" offers no choice`);
    }
  });

  it("counts are real and every value matches at least one setup", () => {
    for (const dimension of filterDimensions()) {
      for (const { value, count } of dimension.values) {
        assert.ok(count > 0);
        const matched = filterSetups({ [dimension.id]: value });
        assert.equal(matched.length, count, `${dimension.id}=${value}`);
      }
    }
  });

  it("omits a dimension with only one value", () => {
    // A filter every row matches is not a filter. With a single setup,
    // difficulty collapses to one value and disappears — while instrument
    // does not, because one setup can name two instruments.
    const single = setups.slice(0, 1);
    const ids = filterDimensions(single).map((d) => d.id);
    assert.ok(!ids.includes("difficulty"), "a single-value dimension must be dropped");
    assert.equal(filterDimensions([]).length, 0);
  });

  it("filters combine, and an impossible combination returns nothing", () => {
    const all = filterSetups({});
    assert.equal(all.length, setups.length);
    const none = filterSetups({ instrument: "forex", session: "asia" });
    assert.equal(none.length, 0);
  });

  it("an unknown filter value matches nothing rather than everything", () => {
    assert.equal(filterSetups({ instrument: "crypto" }).length, 0);
  });
});

describe("replay state", () => {
  it("resolves every stage in order across the timeline", () => {
    const seen: string[] = [];
    for (let p = 0; p <= 1.0001; p += 0.005) {
      const { stage } = replayStateAt(p);
      if (seen[seen.length - 1] !== stage) seen.push(stage);
    }
    assert.deepEqual(seen, [...replayStages]);
  });

  it("progress 1 lands on the last stage, not past the end", () => {
    assert.equal(replayStateAt(1).stage, "review");
    assert.equal(replayStateAt(1).index, replayStages.length - 1);
  });

  it("reverse progression retraces the same stages", () => {
    const points = Array.from({ length: 101 }, (_, i) => i / 100);
    const forward = points.map((p) => replayStateAt(p).stage);
    const backward = [...points].reverse().map((p) => replayStateAt(p).stage).reverse();
    assert.deepEqual(backward, forward);
  });

  it("handles invalid numeric input safely", () => {
    for (const bad of [Number.NaN, -1, 4, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const state = replayStateAt(bad);
      assert.ok(Number.isFinite(state.progress));
      assert.ok(state.progress >= 0 && state.progress <= 1);
      assert.ok(replayStages.includes(state.stage));
      assert.ok(Number.isFinite(state.stageProgress));
    }
    assert.equal(replayStateAt(Number.NaN).stage, "market");
  });

  it("seeking to a stage lands on that stage", () => {
    for (const stage of replayStages) {
      assert.equal(replayStateAt(progressForStage(stage)).stage, stage);
    }
  });

  it("stepping clamps rather than wrapping", () => {
    // Unlike the system loop, a replay ends: wrapping would imply the trade
    // was re-entered.
    assert.equal(stepStage("market", -1), "market");
    assert.equal(stepStage("review", 1), "review");
    assert.equal(stepStage("entry", 1), "invalidation");
  });

  it("converts elapsed time to progress without going out of range", () => {
    assert.equal(progressAfter(-5), 0);
    assert.equal(progressAfter(Number.NaN), 0);
    assert.equal(progressAfter(1e9), 1);
    assert.ok(progressAfter(9000) > 0 && progressAfter(9000) < 1);
  });
});

describe("localization completeness", () => {
  for (const [name, dict] of [["en", en], ["fa", fa]] as const) {
    it(`${name}: every setup has a title, purpose and all eight sections`, () => {
      for (const setup of setups) {
        const copy = dict.lab.items[setup.id as keyof typeof dict.lab.items];
        assert.ok(copy !== undefined, `${name} is missing setup "${setup.id}"`);
        assert.ok(copy.title.length > 0);
        assert.ok(copy.purpose.length > 0);
        for (const section of setupSections) {
          assert.ok(
            copy[section].length > 0,
            `${name}.lab.items.${setup.id}.${section} is empty`,
          );
        }
      }
    });

    it(`${name}: every filter value has a label`, () => {
      for (const setup of setups) {
        for (const v of setup.instruments) assert.ok(dict.lab.instruments[v]);
        for (const v of setup.sessions) assert.ok(dict.lab.sessions[v]);
        for (const v of setup.timeframes) assert.ok(dict.lab.timeframes[v]);
        assert.ok(dict.lab.difficulties[setup.difficulty]);
        assert.ok(dict.lab.evidenceShort[setup.evidence.kind]);
        assert.ok(dict.lab.evidence[setup.evidence.kind]);
      }
    });
  }

  it("carries no orphan setup copy", () => {
    const known = new Set(setups.map((s) => s.id));
    for (const key of Object.keys(en.lab.items)) {
      assert.ok(known.has(key), `lab.items.${key} has copy but no setup`);
    }
  });

  it("Persian lab copy contains no parentheses", () => {
    const blob = JSON.stringify(fa.lab);
    assert.ok(!blob.includes("("));
    assert.ok(!blob.includes(")"));
  });

  it("no setup copy promises a result", () => {
    // §12 language rules. A specification describes conditions, not outcomes.
    const banned = [
      "guaranteed", "guarantee", "never lose", "100% accurate", "easy profit",
      "secret strategy", "print money", "sure thing",
    ];
    const blob = JSON.stringify(en.lab).toLowerCase();
    for (const phrase of banned) {
      assert.ok(!blob.includes(phrase), `setup copy contains "${phrase}"`);
    }
  });
});

describe("route generation", () => {
  it("every setup produces a static path in both locales", () => {
    const params = ["en", "fa"].flatMap((locale) =>
      setups.map((setup) => ({ locale, slug: setup.slug })),
    );
    assert.equal(params.length, setups.length * 2);
    for (const { slug } of params) assert.ok(getSetup(slug) !== undefined);
  });
});

describe("setup search provider", () => {
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
  const provider = createSetupProvider(async () => ({ lab: en.lab }));

  it("does not load its index until something is searched", async () => {
    let loads = 0;
    const counted = createSetupProvider(async () => {
      loads += 1;
      return { lab: en.lab };
    });
    assert.equal(loads, 0, "creating a provider must not fetch its data");
    await counted.search("sweep", ctx);
    assert.equal(loads, 1);
    await counted.search("range", ctx);
    assert.equal(loads, 1, "the index must be fetched once per session");
  });

  it("returns setup slugs as canonical result ids", async () => {
    const results = await provider.search("liquidity sweep", ctx);
    assert.ok(results.some((r) => r.id === "setup.liquidity-sweep-reversal"));
  });

  it("links to the real detail route in the active locale", async () => {
    const hit = (await provider.search("equal highs", ctx)).find(
      (r) => r.id === "setup.equal-highs-draw",
    );
    assert.ok(hit !== undefined);
    assert.equal(hit.href, "/en/setups/equal-highs-draw");
  });

  it("carries the evidence state into the result", async () => {
    const hit = (await provider.search("range to expansion", ctx)).find(
      (r) => r.id === "setup.range-to-expansion",
    );
    assert.ok(hit !== undefined);
    assert.ok(hit.subtitle?.includes(en.lab.evidenceShort.conceptual));
  });

  it("a failed index load does not permanently break the provider", async () => {
    let attempt = 0;
    const flaky = createSetupProvider(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("offline");
      return { lab: en.lab };
    });
    await assert.rejects(() => Promise.resolve(flaky.search("sweep", ctx)));
    const recovered = await flaky.search("sweep", ctx);
    assert.ok(recovered.length > 0, "a retry after a failed load must work");
  });
});
